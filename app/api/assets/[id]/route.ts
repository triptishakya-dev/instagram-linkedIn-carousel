import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { serializeAssets } from "@/lib/assets";
import { prisma } from "@/lib/db";
import { ApiError, toErrorResponse, readJson } from "@/lib/http";
import { deleteKeys } from "@/lib/s3";
import { updateAssetSchema } from "@/lib/validation/asset";

async function ownedAsset(id: string) {
  const userId = await getCurrentUserId();
  const asset = await prisma.asset.findFirst({ where: { id, userId } });
  if (!asset) throw new ApiError(404, "NOT_FOUND", "Asset not found.");
  return { userId, asset };
}

/** GET /api/assets/[id] */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId, asset } = await ownedAsset(id);
    const [serialized] = await serializeAssets(userId, [asset]);
    return NextResponse.json(serialized);
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * PATCH /api/assets/[id]
 * Renames or re-tags. The stored object is never touched — the key is derived
 * from the asset id, not its display name.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId } = await ownedAsset(id);
    const body = updateAssetSchema.parse(await readJson(req));

    const updated = await prisma.asset.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.kind !== undefined ? { kind: body.kind } : {}),
        ...(body.tags !== undefined ? { tags: body.tags } : {}),
      },
    });

    const [serialized] = await serializeAssets(userId, [updated]);
    return NextResponse.json(serialized);
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * DELETE /api/assets/[id]
 * Refused while a scheduled or published post still depends on the asset,
 * which mirrors the guard the library shows before asking.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId, asset } = await ownedAsset(id);

    const blocking = await prisma.post.count({
      where: {
        userId,
        status: { in: ["SCHEDULED", "PUBLISHED", "PARTIALLY_PUBLISHED"] },
        goal: {
          OR: [
            { brandLogoAssetId: id },
            { referenceAssetIds: { has: id } },
            { imageAssetIds: { has: id } },
          ],
        },
      },
    });

    if (blocking > 0) {
      throw new ApiError(
        409,
        "CONFLICT",
        `This asset is used by ${blocking} scheduled or published ${blocking === 1 ? "post" : "posts"}. Swap it there first.`,
      );
    }

    await prisma.asset.delete({ where: { id } });

    // The row is the source of truth; a failed object delete only wastes bytes.
    await deleteKeys([asset.storageKey]).catch((err) =>
      console.warn("[api/assets] object delete failed:", err),
    );

    return NextResponse.json({ success: true, deletedId: id });
  } catch (err) {
    return toErrorResponse(err);
  }
}
