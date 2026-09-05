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
 * GET /api/goals/[id]
 */
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
    const userId = await getCurrentUserId();
    const { id } = await params;

    const existing = await prisma.goal.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      throw new ApiError(404, "NOT_FOUND", "Goal not found.");
    }

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
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getCurrentUserId();
    const { id } = await params;

    const existing = await prisma.goal.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      throw new ApiError(404, "NOT_FOUND", "Goal not found.");
    }

    await prisma.goal.delete({ where: { id } });

    return NextResponse.json({ success: true, deletedId: id });
  } catch (err) {
    return toErrorResponse(err);
  }
}
