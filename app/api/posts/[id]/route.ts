import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ApiError, badRequest, readJson, toErrorResponse } from "@/lib/http";
import { checkScheduleWindow, scheduleCeiling } from "@/lib/schedule";
import { deleteKeys } from "@/lib/s3";
import { zonedToUtc } from "@/lib/tz";
import { updatePostSchema } from "@/lib/validation/post";

type Context = { params: Promise<{ id: string }> };

/**
 * Every query filters on userId as well as id. Scoping by id alone would let
 * anyone who guesses one read or delete someone else's post.
 */
export async function GET(_req: Request, { params }: Context) {
  try {
    const { id } = await params;
    const userId = await getCurrentUserId();

    const post = await prisma.post.findFirst({
      where: { id, userId },
      include: {
        media: { orderBy: { order: "asc" } },
        targets: {
          include: {
            socialTarget: true,
            attempts: { orderBy: { createdAt: "desc" } },
          },
        },
      },
    });

    if (!post) throw new ApiError(404, "NOT_FOUND", "Post not found.");

    return NextResponse.json(post);
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** Edits a post that has not started publishing. */
export async function PATCH(req: Request, { params }: Context) {
  try {
    const { id } = await params;
    const userId = await getCurrentUserId();
    const body = updatePostSchema.parse(await readJson(req));

    const existing = await prisma.post.findFirst({
      where: { id, userId },
      select: { id: true, status: true, timezone: true },
    });

    if (!existing) throw new ApiError(404, "NOT_FOUND", "Post not found.");

    // Once a worker has claimed it, the provider calls may already be in
    // flight; editing the row would not un-send them.
    if (existing.status !== "DRAFT" && existing.status !== "SCHEDULED") {
      throw new ApiError(
        409,
        "CONFLICT",
        `A post that is ${existing.status} can no longer be edited.`,
      );
    }

    const data: {
      caption?: string;
      captionPrompt?: string | null;
      staleAfterMinutes?: number;
      timezone?: string;
      scheduledAt?: Date;
    } = {};

    if (body.caption !== undefined) data.caption = body.caption;
    if (body.captionPrompt !== undefined) data.captionPrompt = body.captionPrompt ?? null;
    if (body.staleAfterMinutes !== undefined) data.staleAfterMinutes = body.staleAfterMinutes;
    if (body.timezone !== undefined) data.timezone = body.timezone;

    if (body.date !== undefined && body.time !== undefined) {
      const timezone = body.timezone ?? existing.timezone;
      if (!timezone) throw badRequest("This post has no time zone; send one.", "timezone");

      let scheduledAt: Date;
      try {
        scheduledAt = zonedToUtc(body.date, body.time, timezone);
      } catch (err) {
        throw badRequest((err as Error).message, "date");
      }

      const window = checkScheduleWindow(scheduledAt, await scheduleCeiling(userId));
      if (!window.ok) {
        throw new ApiError(
          422,
          "SCHEDULE_WINDOW",
          window.message,
          window.reason === "TOO_SOON" ? "time" : "date",
        );
      }

      data.scheduledAt = scheduledAt;
    }

    const post = await prisma.$transaction(async (tx) => {
      const updated = await tx.post.update({
        where: { id },
        data,
        select: { id: true, status: true, scheduledAt: true },
      });

      // PublishTarget carries its own copy of the slot for the claim query.
      if (data.scheduledAt) {
        await tx.publishTarget.updateMany({
          where: { postId: id, status: "PENDING" },
          data: { scheduledAt: data.scheduledAt },
        });
      }

      return updated;
    });

    return NextResponse.json(post);
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** Removes the post, its rows, and the objects behind it. */
export async function DELETE(_req: Request, { params }: Context) {
  try {
    const { id } = await params;
    const userId = await getCurrentUserId();

    const post = await prisma.post.findFirst({
      where: { id, userId },
      select: {
        id: true,
        status: true,
        media: { select: { storageKey: true, publicId: true } },
      },
    });

    if (!post) throw new ApiError(404, "NOT_FOUND", "Post not found.");

    if (post.status === "PROCESSING") {
      throw new ApiError(409, "CONFLICT", "This post is publishing right now.");
    }

    // A generated slide records its object key on `storageKey`; one composed
    // by hand carries it on `publicId`. Reading only `publicId` left every
    // image the generation pipeline rendered orphaned in the bucket, since
    // that column is null on those rows.
    const keys = [
      ...new Set(
        post.media
          .flatMap((m) => [m.storageKey, m.publicId])
          .filter((k): k is string => Boolean(k)),
      ),
    ];

    // Rows first: a failed object delete leaves storage to the lifecycle rule,
    // whereas a failed row delete would leave a post whose images are gone.
    await prisma.post.delete({ where: { id } });
    await deleteKeys(keys).catch((err) =>
      console.warn(`[api/posts/${id}] object cleanup failed:`, err),
    );

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
