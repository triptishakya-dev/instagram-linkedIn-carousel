import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ApiError, readJson, toErrorResponse } from "@/lib/http";
import {
  copyObject,
  extensionForMime,
  headObject,
  isAllowedImageMime,
  isOwnedTmpKey,
  publicUrlFor,
} from "@/lib/s3";
import { updateGoalSchema } from "@/lib/validation/goal";

/**
 * Resolves a goal the caller owns, or throws.
 *
 * Someone else's id yields the same 404 as one that does not exist — a 403
 * would confirm the row is real to a caller who has no business knowing.
 */
async function ownedGoal(id: string) {
  const userId = await getCurrentUserId();
  const goal = await prisma.goal.findFirst({ where: { id, userId } });
  if (!goal) throw new ApiError(404, "NOT_FOUND", "Goal not found.");
  return { userId, goal };
}

/** GET /api/goals/[id] */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getCurrentUserId();
    const { id } = await params;

    const goal = await prisma.goal.findFirst({
      where: { id, userId },
      include: { posts: true },
    });

    if (!goal) {
      throw new ApiError(404, "NOT_FOUND", "Goal not found.");
    }

    return NextResponse.json(goal);
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * PUT /api/goals/[id]
 * Updates an existing goal.
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { userId, goal: existing } = await ownedGoal(id);

    const body = updateGoalSchema.parse(await readJson(req));
    let logoAssetId = body.brandLogoAssetId !== undefined ? body.brandLogoAssetId : existing.brandLogoAssetId;

    if (body.logoKey) {
      if (!isOwnedTmpKey(body.logoKey, userId)) {
        throw new ApiError(403, "FORBIDDEN", "The logo upload does not belong to you.", "logoKey");
      }

      const head = await headObject(body.logoKey);
      if (!head) {
        throw new ApiError(422, "MEDIA_NOT_FOUND", "The uploaded logo file was not found in S3.", "logoKey");
      }

      if (!head.contentType || !isAllowedImageMime(head.contentType)) {
        throw new ApiError(
          422,
          "MEDIA_REJECTED",
          `Unsupported image type ${head.contentType ?? "unknown"}.`,
          "logoKey",
        );
      }

      const ext = extensionForMime(head.contentType);
      const finalKey = `logos/${userId}/${id}.${ext}`;
      await copyObject(body.logoKey, finalKey);
      logoAssetId = publicUrlFor(finalKey);
    }

    const updated = await prisma.goal.update({
      where: { id },
      data: {
        ...(body.name ? { name: body.name } : {}),
        ...(body.platforms ? { platforms: body.platforms } : {}),
        ...(logoAssetId !== undefined ? { brandLogoAssetId: logoAssetId } : {}),
        ...(body.captionPrompt !== undefined ? { captionPrompt: body.captionPrompt } : {}),
        ...(body.imagePrompt !== undefined ? { imagePrompt: body.imagePrompt } : {}),
        ...(body.startDate ? { startDate: new Date(body.startDate) } : {}),
        ...(body.endDate !== undefined ? { endDate: body.endDate ? new Date(body.endDate) : null } : {}),
        ...(body.schedule ? { schedule: body.schedule } : {}),
        ...(body.referenceAssetIds ? { referenceAssetIds: body.referenceAssetIds } : {}),
        ...(body.imageAssetIds ? { imageAssetIds: body.imageAssetIds } : {}),
        ...(body.modelId !== undefined ? { modelId: body.modelId } : {}),
        ...(body.status ? { status: body.status } : {}),
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * DELETE /api/goals/[id]
 *
 * `Post.goalId` is `onDelete: SetNull`, so the posts a goal produced outlive
 * it — which is the intent for anything already drafted or published, but not
 * obviously so for one still scheduled: it would fire on its own later with no
 * goal left to explain where it came from. A scheduled post therefore makes
 * this a 409 unless `?force=true` says to go ahead and detach it.
 *
 * Force leaves those posts scheduled rather than demoting them. Unlike an
 * account disconnect, nothing they need has gone away — the caption, media and
 * targets are all still there, so the post can still publish exactly as the
 * user set it up to.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { userId, goal } = await ownedGoal(id);

    const force = new URL(req.url).searchParams.get("force") === "true";

    const result = await prisma.$transaction(async (tx) => {
      const scheduled = await tx.post.findMany({
        where: { userId, goalId: id, status: "SCHEDULED" },
        select: { id: true, scheduledAt: true },
        orderBy: { scheduledAt: "asc" },
      });

      if (!force && scheduled.length > 0) {
        // The posts ride along in `details` so the confirmation can name them
        // rather than only counting them.
        throw new ApiError(
          409,
          "CONFLICT",
          `${scheduled.length} scheduled ${scheduled.length === 1 ? "post comes" : "posts come"} from ${goal.name}. ` +
            `Deleting it leaves ${scheduled.length === 1 ? "that post" : "those posts"} in the queue with no goal — ` +
            "delete anyway to detach them.",
          undefined,
          { posts: scheduled },
        );
      }

      // Every post of this goal loses its `goalId`, not just the scheduled
      // ones. Counted before the delete: the foreign key is what clears the
      // column, and it leaves nothing behind to count afterwards.
      const detachedPostCount = await tx.post.count({ where: { userId, goalId: id } });

      await tx.goal.delete({ where: { id } });

      return { detachedPostCount, detachedScheduledCount: scheduled.length };
    });

    return NextResponse.json({ success: true, deletedId: id, ...result });
  } catch (err) {
    return toErrorResponse(err);
  }
}
