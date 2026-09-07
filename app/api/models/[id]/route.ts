import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getCurrentUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ApiError, readJson, toErrorResponse } from "@/lib/http";
import { clearModelFromSettings } from "@/lib/model-refs";
import { updateModelSchema } from "@/lib/validation/model";

/**
 * Resolves a model the caller owns, or throws.
 *
 * Someone else's id yields the same 404 as one that does not exist — a 403
 * would confirm the row is real to a caller who has no business knowing.
 */
async function ownedModel(id: string) {
  const userId = await getCurrentUserId();
  const model = await prisma.aiModel.findFirst({ where: { id, userId } });
  if (!model) throw new ApiError(404, "NOT_FOUND", "AI Model not found.");
  return { userId, model };
}

/** GET /api/models/[id] */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { model } = await ownedModel(id);
    return NextResponse.json(model);
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * PUT /api/models/[id]
 * Partial update: only the fields present in the body are written.
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { model: existing } = await ownedModel(id);

    const body = updateModelSchema.parse(await readJson(req));

    // A rotated key replaces the stored suffix; an absent one leaves it alone,
    // so a PUT that only moves the temperature slider does not blank it.
    const keyLast4 = body.key ? body.key.trim().slice(-4) : existing.keyLast4;

    const updated = await prisma.aiModel.update({
      where: { id },
      data: {
        ...(body.label !== undefined ? { label: body.label } : {}),
        ...(body.provider !== undefined ? { provider: body.provider } : {}),
        ...(body.role !== undefined ? { role: body.role } : {}),
        ...(body.inputPricePerMTokInr !== undefined
          ? { inputPricePerMTokInr: body.inputPricePerMTokInr }
          : {}),
        ...(body.outputPricePerMTokInr !== undefined
          ? { outputPricePerMTokInr: body.outputPricePerMTokInr }
          : {}),
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
 *
 * `Goal.modelId` is a plain column rather than a relation, and the workspace
 * settings blob is opaque JSON, so nothing at the database level stops a
 * delete from leaving either one pointing at an id that no longer resolves —
 * the failure would surface much later, when a scheduled run has no model to
 * generate with. This refuses instead, unless `?force=true` says to clear the
 * references that hold it.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { userId, model } = await ownedModel(id);

    const force = new URL(req.url).searchParams.get("force") === "true";

    if (!force) {
      const blocking = await prisma.goal.findMany({
        where: { userId, modelId: id, status: "ACTIVE" },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });

      if (blocking.length > 0) {
        // The goal names ride along in `details` so the confirmation can name
        // them rather than only counting them.
        throw new ApiError(
          409,
          "CONFLICT",
          `${blocking.length} active ${blocking.length === 1 ? "goal uses" : "goals use"} ${model.label}. ` +
            "Pick a different model there first, or delete anyway to clear it.",
          undefined,
          { goals: blocking },
        );
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      // Paused and ended goals are cleared too: a dangling id is no more
      // useful to them than to an active one, and leaving it would resurrect
      // the problem the moment the goal is reactivated.
      const { count: clearedGoalCount } = await tx.goal.updateMany({
        where: { userId, modelId: id },
        data: { modelId: null },
      });

      const workspace = await tx.workspaceSetting.findUnique({
        where: { userId },
        select: { settings: true },
      });

      const clearedSettings = clearModelFromSettings(workspace?.settings, id);

      if (clearedSettings) {
        await tx.workspaceSetting.update({
          where: { userId },
          data: { settings: clearedSettings.settings as Prisma.InputJsonValue },
        });
      }

      await tx.aiModel.delete({ where: { id } });

      return { clearedGoalCount, clearedDefaults: clearedSettings?.cleared ?? [] };
    });

    return NextResponse.json({ success: true, deletedId: id, ...result });
  } catch (err) {
    return toErrorResponse(err);
  }
}
