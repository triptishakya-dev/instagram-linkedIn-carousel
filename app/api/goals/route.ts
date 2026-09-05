import { randomUUID } from "node:crypto";
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
import { createGoalSchema } from "@/lib/validation/goal";

/**
 * GET /api/goals
 * Fetches all goals created by the current user.
 */
export async function GET() {
  try {
    const userId = await getCurrentUserId();
    const goals = await prisma.goal.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ goals });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * POST /api/goals
 * Creates a new content goal. Handles optional AWS S3 brand logo copy if logoKey is provided.
 */
export async function POST(req: Request) {
  const copiedKeys: string[] = [];

  try {
    const userId = await getCurrentUserId();
    const body = createGoalSchema.parse(await readJson(req));
    const goalId = randomUUID();

    let logoAssetId = body.brandLogoAssetId ?? null;

    // Handle AWS S3 logo upload processing if logoKey was supplied from presigned upload
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
          `Unsupported image type ${head.contentType ?? "unknown"}. Use PNG, JPG or WEBP.`,
          "logoKey",
        );
      }

      const ext = extensionForMime(head.contentType);
      const finalKey = `logos/${userId}/${goalId}.${ext}`;

      await copyObject(body.logoKey, finalKey);
      copiedKeys.push(finalKey);

      logoAssetId = publicUrlFor(finalKey);
    }

    const startDate = new Date(body.startDate);
    const endDate = body.endDate ? new Date(body.endDate) : null;

    const goal = await prisma.goal.create({
      data: {
        id: goalId,
        userId,
        name: body.name,
        platforms: body.platforms,
        brandLogoAssetId: logoAssetId,
        captionPrompt: body.captionPrompt ?? null,
        imagePrompt: body.imagePrompt ?? null,
        startDate,
        endDate,
        schedule: body.schedule,
        referenceAssetIds: body.referenceAssetIds,
        imageAssetIds: body.imageAssetIds,
        modelId: body.modelId ?? null,
        status: body.status,
      },
    });

    return NextResponse.json(goal, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
