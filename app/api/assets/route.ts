import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { serializeAssets } from "@/lib/assets";
import { prisma } from "@/lib/db";
import { ApiError, readJson, toErrorResponse } from "@/lib/http";
import { assetKindForMime } from "@/lib/media";
import {
  MAX_ASSET_BYTES,
  buildAssetKey,
  copyObject,
  deleteKeys,
  isAllowedAssetMime,
  isOwnedTmpKey,
  headObject,
} from "@/lib/s3";
import { createAssetSchema } from "@/lib/validation/asset";

/**
 * GET /api/assets
 * The user's library, newest first, each row carrying a signed preview URL.
 */
export async function GET() {
  try {
    const userId = await getCurrentUserId();
    const assets = await prisma.asset.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ assets: await serializeAssets(userId, assets) });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * POST /api/assets
 * Confirms an upload that already reached `tmp/` via a presigned PUT: moves the
 * object to its permanent key and records the row.
 *
 * The object is copied before the row is written, so a database failure leaves
 * a stray object (swept by the `assets/` lifecycle rule) rather than a row
 * pointing at storage that is not there.
 */
export async function POST(req: Request) {
  let copiedKey: string | null = null;

  try {
    const userId = await getCurrentUserId();
    const body = createAssetSchema.parse(await readJson(req));

    if (!isOwnedTmpKey(body.key, userId)) {
      throw new ApiError(403, "FORBIDDEN", "That upload does not belong to you.", "key");
    }

    const head = await headObject(body.key);
    if (!head) {
      throw new ApiError(
        422,
        "MEDIA_NOT_FOUND",
        "The upload is missing from storage. Try uploading the file again.",
        "key",
      );
    }

    if (!head.contentType || !isAllowedAssetMime(head.contentType)) {
      throw new ApiError(
        422,
        "MEDIA_REJECTED",
        `Unsupported file type ${head.contentType ?? "unknown"}.`,
        "key",
      );
    }

    // A presigned PUT cannot enforce the size it was signed for, so the real
    // object is measured here rather than trusting what the browser declared.
    if (head.contentLength > MAX_ASSET_BYTES) {
      throw new ApiError(
        422,
        "MEDIA_REJECTED",
        `File is over the ${Math.floor(MAX_ASSET_BYTES / 1024 / 1024)} MB limit.`,
        "key",
      );
    }

    const assetId = randomUUID();
    const storageKey = buildAssetKey(userId, assetId, head.contentType);

    await copyObject(body.key, storageKey);
    copiedKey = storageKey;

    const asset = await prisma.asset.create({
      data: {
        id: assetId,
        userId,
        name: body.name,
        kind: body.kind ?? assetKindForMime(head.contentType),
        mimeType: head.contentType,
        sizeBytes: head.contentLength,
        width: body.width ?? null,
        height: body.height ?? null,
        tags: body.tags,
        storageKey,
        uploadedBy: userId,
      },
    });

    // The tmp copy is redundant now; the lifecycle rule catches any that stay.
    await deleteKeys([body.key]).catch((err) =>
      console.warn("[api/assets] tmp cleanup failed:", err),
    );

    const [serialized] = await serializeAssets(userId, [asset]);
    return NextResponse.json(serialized, { status: 201 });
  } catch (err) {
    if (copiedKey) {
      await deleteKeys([copiedKey]).catch(() => {
        /* lifecycle rules will collect it */
      });
    }
    return toErrorResponse(err);
  }
}
