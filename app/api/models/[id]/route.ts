import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ApiError, readJson, toErrorResponse } from "@/lib/http";
import { updateModelSchema } from "@/lib/validation/model";

/**
 * GET /api/models/[id]
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getCurrentUserId();
    const { id } = await params;

    const model = await prisma.aiModel.findFirst({
      where: { id, userId },
    });

    if (!model) {
      throw new ApiError(404, "NOT_FOUND", "AI Model not found.");
    }

    return NextResponse.json(model);
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * PUT /api/models/[id]
 * Updates an existing AI model configuration.
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getCurrentUserId();
    const { id } = await params;

    const existing = await prisma.aiModel.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      throw new ApiError(404, "NOT_FOUND", "AI Model not found.");
    }

    const body = updateModelSchema.parse(await readJson(req));
    const keyLast4 = body.key ? body.key.trim().slice(-4) : existing.keyLast4;

    const updated = await prisma.aiModel.update({
      where: { id },
      data: {
        ...(body.label !== undefined ? { label: body.label } : {}),
        ...(body.provider !== undefined ? { provider: body.provider } : {}),
        ...(body.role !== undefined ? { role: body.role } : {}),
        ...(body.inputPricePerMTokInr !== undefined ? { inputPricePerMTokInr: body.inputPricePerMTokInr } : {}),
        ...(body.outputPricePerMTokInr !== undefined ? { outputPricePerMTokInr: body.outputPricePerMTokInr } : {}),
        ...(body.maxTokens !== undefined ? { maxTokens: body.maxTokens } : {}),
        ...(body.temperature !== undefined ? { temperature: body.temperature } : {}),
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
        keyLast4,
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * DELETE /api/models/[id]
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getCurrentUserId();
    const { id } = await params;

    const existing = await prisma.aiModel.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      throw new ApiError(404, "NOT_FOUND", "AI Model not found.");
    }

    await prisma.aiModel.delete({ where: { id } });

    return NextResponse.json({ success: true, deletedId: id });
  } catch (err) {
    return toErrorResponse(err);
  }
}
