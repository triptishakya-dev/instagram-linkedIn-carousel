import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { Platform } from "@prisma/client";
import { getCurrentUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ApiError, badRequest, readJson, toErrorResponse } from "@/lib/http";
import { checkScheduleWindow, scheduleCeiling } from "@/lib/schedule";
import {
  MAX_UPLOAD_BYTES,
  buildPostKey,
  copyObject,
  deleteKeys,
  headObject,
  isAllowedImageMime,
  isOwnedTmpKey,
  publicUrlFor,
  type AllowedImageMime,
} from "@/lib/s3";
import { zonedToUtc } from "@/lib/tz";
import { checkPlatformRules, createPostSchema } from "@/lib/validation/post";

type ResolvedMedia = {
  order: number;
  tmpKey: string;
  finalKey: string;
  mime: AllowedImageMime;
  bytes: number;
};

/**
 * Turns the composer's draft into a scheduled post.
 *
 * Ordering matters here. Objects are copied to their permanent keys *before*
 * the transaction, so a database failure leaves an orphaned object (collected
 * by the `tmp/` lifecycle rule and the best-effort cleanup below) rather than
 * a row pointing at storage that does not exist.
 */
export async function POST(req: Request) {
  const copiedKeys: string[] = [];

  try {
    const userId = await getCurrentUserId();
    const idempotencyKey = req.headers.get("Idempotency-Key")?.trim() || null;

    // A retried submit returns the original post instead of creating a second one.
    if (idempotencyKey) {
      const existing = await prisma.post.findFirst({
        where: { idempotencyKey, userId },
        select: { id: true, status: true, scheduledAt: true },
      });
      if (existing) {
        return NextResponse.json({ ...existing, replayed: true }, { status: 200 });
      }
    }

    const body = createPostSchema.parse(await readJson(req));

    /* ------------------------------------------------------------- media -- */

    const postId = randomUUID();
    const ordered = [...body.media].sort((a, b) => a.order - b.order);

    if (new Set(ordered.map((m) => m.key)).size !== ordered.length) {
      throw badRequest("The same upload was attached twice.", "media");
    }

    const resolved: ResolvedMedia[] = [];

    for (const [index, item] of ordered.entries()) {
      if (!isOwnedTmpKey(item.key, userId)) {
        // Either a malformed key or someone else's upload.
        throw new ApiError(403, "FORBIDDEN", "That upload does not belong to you.", "media");
      }

      const head = await headObject(item.key);
      if (!head) {
        throw new ApiError(
          422,
          "MEDIA_NOT_FOUND",
          "The upload is missing from storage. Upload the logo again.",
          "media",
        );
      }

      if (!head.contentType || !isAllowedImageMime(head.contentType)) {
        throw new ApiError(
          422,
          "MEDIA_REJECTED",
          `Unsupported image type ${head.contentType ?? "unknown"}. Use PNG, JPG or WEBP.`,
          "media",
        );
      }

      // The declared size at presign time is not binding; this is the real one.
      if (head.contentLength > MAX_UPLOAD_BYTES) {
        throw new ApiError(
          422,
          "MEDIA_REJECTED",
          `Image is ${head.contentLength} bytes, over the ${MAX_UPLOAD_BYTES} byte limit.`,
          "media",
        );
      }

      resolved.push({
        order: index,
        tmpKey: item.key,
        finalKey: buildPostKey(userId, postId, index, head.contentType),
        mime: head.contentType,
        bytes: head.contentLength,
      });
    }

    /* -------------------------------------------------------------- rules -- */

    const violations = checkPlatformRules({
      platforms: body.platforms,
      caption: body.caption,
      mediaCount: resolved.length,
    });

    if (violations.length > 0) {
      const first = violations[0];
      throw new ApiError(422, "PLATFORM_RULE", first.message, first.field);
    }

    /* ----------------------------------------------------------- schedule -- */

    let scheduledAt: Date;
    try {
      scheduledAt = zonedToUtc(body.date, body.time, body.timezone);
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

    /* ------------------------------------------------------------ targets -- */

    // PublishTarget needs a real connected destination. Platforms without one
    // are still recorded on the post, and get materialised after OAuth lands.
    const connected = await prisma.socialTarget.findMany({
      where: {
        platform: { in: body.platforms },
        socialAccount: { userId, isValid: true },
      },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      select: { id: true, platform: true },
    });

    const targetByPlatform = new Map<Platform, string>();
    for (const target of connected) {
      if (!targetByPlatform.has(target.platform)) {
        targetByPlatform.set(target.platform, target.id);
      }
    }

    const unconnected = body.platforms.filter((p) => !targetByPlatform.has(p));

    /* ------------------------------------------------------------- commit -- */

    for (const media of resolved) {
      await copyObject(media.tmpKey, media.finalKey);
      copiedKeys.push(media.finalKey);
    }

    const post = await prisma.$transaction(async (tx) => {
      const created = await tx.post.create({
        data: {
          id: postId,
          userId,
          caption: body.caption,
          captionPrompt: body.captionPrompt ?? null,
          status: "SCHEDULED",
          scheduledAt,
          timezone: body.timezone,
          staleAfterMinutes: body.staleAfterMinutes,
          intendedPlatforms: body.platforms,
          idempotencyKey,
          media: {
            create: resolved.map((media) => ({
              order: media.order,
              url: publicUrlFor(media.finalKey),
              publicId: media.finalKey,
              format: media.mime.replace("image/", ""),
              fileSizeBytes: media.bytes,
            })),
          },
        },
        select: { id: true, status: true, scheduledAt: true },
      });

      if (targetByPlatform.size > 0) {
        await tx.publishTarget.createMany({
          data: [...targetByPlatform.values()].map((socialTargetId) => ({
            postId: created.id,
            socialTargetId,
            scheduledAt,
            status: "PENDING" as const,
          })),
        });
      }

      return created;
    });

    // The tmp copies are redundant now. Failing to delete them is harmless —
    // the lifecycle rule on the prefix will.
    await deleteKeys(resolved.map((m) => m.tmpKey)).catch((err) =>
      console.warn("[api/posts] tmp cleanup failed:", err),
    );

    return NextResponse.json(
      {
        ...post,
        mediaCount: resolved.length,
        publishTargetCount: targetByPlatform.size,
        /** Selected, but not publishable until an account is connected. */
        unconnectedPlatforms: unconnected,
      },
      { status: 201 },
    );
  } catch (err) {
    if (copiedKeys.length > 0) {
      await deleteKeys(copiedKeys).catch(() => {
        /* lifecycle rules and the next sweep will get these */
      });
    }
    return toErrorResponse(err);
  }
}

/** The user's posts, newest scheduled slot first. */
export async function GET(req: Request) {
  try {
    const userId = await getCurrentUserId();
    const url = new URL(req.url);

    const status = url.searchParams.get("status");
    const rawLimit = Number(url.searchParams.get("limit") ?? 20);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 20;
    const cursor = url.searchParams.get("cursor");

    const posts = await prisma.post.findMany({
      where: {
        userId,
        ...(status ? { status: status as never } : {}),
      },
      orderBy: [{ scheduledAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        media: { orderBy: { order: "asc" } },
        targets: { include: { socialTarget: true } },
      },
    });

    const hasMore = posts.length > limit;
    const page = hasMore ? posts.slice(0, limit) : posts;

    return NextResponse.json({
      posts: page,
      nextCursor: hasMore ? page[page.length - 1]?.id : null,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
