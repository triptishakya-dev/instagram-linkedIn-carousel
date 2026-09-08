import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canEncryptSecrets, encryptSecret } from "@/lib/crypto";
import { ApiError, readJson, toErrorResponse } from "@/lib/http";
import { createModelSchema } from "@/lib/validation/model";

/**
 * Every column except the encrypted key.
 *
 * `apiKeyCipher` is not secret in the sense that reading it reveals the key,
 * but shipping it to the browser puts a ciphertext in front of anyone who can
 * open devtools, for no reason: nothing in the UI can use it. `keyLast4` is
 * what the card shows.
 */
const PUBLIC_FIELDS = {
  id: true,
  userId: true,
  label: true,
  provider: true,
  role: true,
  inputPricePerMTokInr: true,
  outputPricePerMTokInr: true,
  maxTokens: true,
  temperature: true,
  enabled: true,
  keyLast4: true,
  apiModelId: true,
  createdAt: true,
  updatedAt: true,
} as const;

const DEFAULT_MODELS = [
  {
    label: "Claude 3.5 Sonnet",
    provider: "Anthropic",
    apiModelId: "claude-sonnet-4-5",
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
    apiModelId: "claude-haiku-4-5",
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
    apiModelId: "gpt-4o",
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
      select: PUBLIC_FIELDS,
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

    // The key the user typed is stored encrypted and sent with the call for
    // this model; only its last four characters stay readable, which is what
    // the card shows back so a key can be recognised without being exposed.
    // Refused rather than dropped. Discarding a key the user typed is what
    // made the field decorative before; a 503 says the deployment cannot keep
    // secrets yet, which is the operator's problem and not silent data loss.
    if (body.key?.trim() && !canEncryptSecrets()) {
      throw new ApiError(
        503,
        "INTERNAL",
        "This deployment cannot store a provider key: TOKEN_ENCRYPTION_KEY is not set.",
      );
    }

    const key = body.key?.trim() || null;
    const keyLast4 = key ? key.slice(-4) : null;

    const model = await prisma.aiModel.create({
      data: {
        userId,
        label: body.label,
        provider: body.provider,
        apiModelId: body.apiModelId ? body.apiModelId.trim() : null,
        role: body.role,
        inputPricePerMTokInr: body.inputPricePerMTokInr,
        outputPricePerMTokInr: body.outputPricePerMTokInr,
        maxTokens: body.maxTokens,
        temperature: body.temperature,
        enabled: body.enabled,
        keyLast4,
        apiKeyCipher: key ? encryptSecret(key) : null,
      },
      select: PUBLIC_FIELDS,
    });

    return NextResponse.json(model, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
