import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ApiError, toErrorResponse } from "@/lib/http";

async function ownedAccount(id: string) {
  const userId = await getCurrentUserId();
  const account = await prisma.socialAccount.findFirst({
    where: { id, userId },
    select: { id: true, platform: true, name: true, username: true },
  });
  if (!account) throw new ApiError(404, "NOT_FOUND", "Connected account not found.");
  return { userId, account };
}

/** GET /api/accounts/[id] */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { account } = await ownedAccount(id);
    return NextResponse.json(account);
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * DELETE /api/accounts/[id] — disconnect.
 *
 * `SocialTarget` cascades from the account and `PublishTarget` cascades from
 * the target, so this delete quietly takes the publish rows of every scheduled
 * post aimed at the account with it. That is destructive enough to refuse by
 * default: without `?force=true` a scheduled post makes this a 409.
 *
 * With `force`, a post left with no destination at all is demoted to `DRAFT`
 * rather than left `SCHEDULED` — a post that claims to be scheduled while
 * having nothing to publish to would simply never fire, with nothing on screen
 * to explain why.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { userId, account } = await ownedAccount(id);

    const force = new URL(req.url).searchParams.get("force") === "true";

    // Read the affected posts before the delete: the rows that identify them
    // are the ones about to be cascaded away.
    const affected = await prisma.publishTarget.findMany({
      where: {
        socialTarget: { socialAccountId: id },
        post: { userId, status: "SCHEDULED" },
      },
      select: { postId: true },
    });

    const affectedPostIds = [...new Set(affected.map((t) => t.postId))];

    if (!force && affectedPostIds.length > 0) {
      throw new ApiError(
        409,
        "CONFLICT",
        `${affectedPostIds.length} scheduled ${affectedPostIds.length === 1 ? "post targets" : "posts target"} ` +
          `${account.name ?? account.platform}. Disconnecting drops ${affectedPostIds.length === 1 ? "its" : "their"} ` +
          "publish destination — disconnect anyway to move them back to drafts.",
      );
    }

    const demoted = await prisma.$transaction(async (tx) => {
      await tx.socialAccount.delete({ where: { id } });

      if (affectedPostIds.length === 0) return 0;

      // Only the posts that lost their *last* destination; one still holding a
      // target on another platform stays scheduled.
      const stillTargeted = await tx.publishTarget.findMany({
        where: { postId: { in: affectedPostIds } },
        select: { postId: true },
      });

      const keep = new Set(stillTargeted.map((t) => t.postId));
      const orphaned = affectedPostIds.filter((pid) => !keep.has(pid));
      if (orphaned.length === 0) return 0;

      const result = await tx.post.updateMany({
        where: { id: { in: orphaned }, userId },
        data: { status: "DRAFT" },
      });

      return result.count;
    });

    return NextResponse.json({
      success: true,
      deletedId: id,
      /** Posts moved back to drafts because they lost their last destination. */
      draftedPostCount: demoted,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
