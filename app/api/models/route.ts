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
 *
 * Seeds `DEFAULT_MODELS` on the workspace's first read, so a new user has
 * something to point a goal at.
 *
 * The seed fires on `modelsSeededAt` being unset rather than on the list being
 * empty: those two conditions look identical on a first visit, but they part
 * ways the moment someone deletes their last model — and seeding on an empty
 * list would hand the three defaults straight back on the next reload, with
 * nothing on screen to explain why the delete did not take.
 */
export async function GET() {
  try {
    const userId = await getCurrentUserId();

    const workspace = await prisma.workspaceSetting.findUnique({
      where: { userId },
      select: { modelsSeededAt: true },
    });

    if (!workspace?.modelsSeededAt) {
      await prisma.$transaction(async (tx) => {
        // A workspace with rows already but no stamp predates this column, so
        // it has been seeded before whatever the marker says.
        const existing = await tx.aiModel.count({ where: { userId } });

        if (existing === 0) {
          await tx.aiModel.createMany({
            data: DEFAULT_MODELS.map((m) => ({ ...m, userId })),
          });
        }

        await tx.workspaceSetting.upsert({
          where: { userId },
          create: { userId, settings: {}, modelsSeededAt: new Date() },
          update: { modelsSeededAt: new Date() },
        });
      });
    }

    const models = await prisma.aiModel.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });

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
