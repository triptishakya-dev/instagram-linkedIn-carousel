import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { readJson, toErrorResponse } from "@/lib/http";
import { createModelSchema } from "@/lib/validation/model";

const DEFAULT_MODELS = [
  {
    label: "Claude 3.5 Sonnet",
    provider: "Anthropic",
    role: "BOTH" as const,
    inputPricePerMTokInr: 268,
    outputPricePerMTokInr: 1340,
    maxTokens: 8192,
    temperature: 0.7,
    enabled: true,
  },
  {
    label: "Claude 3.5 Haiku",
    provider: "Anthropic",
    role: "CAPTION" as const,
    inputPricePerMTokInr: 67,
    outputPricePerMTokInr: 335,
    maxTokens: 4096,
    temperature: 0.7,
    enabled: true,
  },
  {
    label: "GPT-4o",
    provider: "OpenAI",
    role: "BOTH" as const,
    inputPricePerMTokInr: 224,
    outputPricePerMTokInr: 896,
    maxTokens: 4096,
    temperature: 0.7,
    enabled: true,
  },
];

/**
 * GET /api/models
 * Fetches all AI models belonging to current user. Auto-seeds default models if none exist.
 */
export async function GET() {
  try {
    const userId = await getCurrentUserId();
    let models = await prisma.aiModel.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });

    // Auto-seed initial default models if user has no models in DB yet
    if (models.length === 0) {
      await prisma.aiModel.createMany({
        data: DEFAULT_MODELS.map((m) => ({ ...m, userId })),
      });
      models = await prisma.aiModel.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
      });
    }

    return NextResponse.json({ models });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * POST /api/models
 * Creates a new AI model entry in PostgreSQL.
 */
export async function POST(req: Request) {
  try {
    const userId = await getCurrentUserId();
    const body = createModelSchema.parse(await readJson(req));
    const keyLast4 = body.key ? body.key.trim().slice(-4) : null;

    const model = await prisma.aiModel.create({
      data: {
        userId,
        label: body.label,
        provider: body.provider,
        role: body.role,
        inputPricePerMTokInr: body.inputPricePerMTokInr,
        outputPricePerMTokInr: body.outputPricePerMTokInr,
        maxTokens: body.maxTokens,
        temperature: body.temperature,
        enabled: body.enabled,
        keyLast4,
      },
    });

    return NextResponse.json(model, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
