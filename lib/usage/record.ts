/**
 * Writing one provider invocation to the ledger.
 *
 * Every AI call in the application funnels through here, so cost, status,
 * latency and attribution are decided in one place rather than three. The
 * provider modules stay dumb: they report what came back, this decides what it
 * means.
 *
 * `UsageEvent` is the application's source of truth for usage. Langfuse traces
 * the same calls and is linked by id, but nothing here depends on Langfuse
 * being reachable -- see `lib/usage/trace.ts`.
 */

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { captionCostInr, imageCostInr, type TokenRates } from "./cost";

export type UsageKind = "CAPTION" | "IMAGE";

/** Who and what the call belongs to. Everything optional is genuinely absent. */
export type UsageAttribution = {
  userId: string;
  goalId?: string | null;
  postId?: string | null;
  generationRunId?: string | null;
  /** The `AiModel` row that was billed. */
  modelId?: string | null;
  provider: string;
  apiModelId: string;
  /** Temporal's attempt counter for the activity that made the call. */
  attempt?: number | null;
};

export type CaptionOutcome = {
  kind: "CAPTION";
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens?: number | null;
  rates: TokenRates;
};

export type ImageOutcome = {
  kind: "IMAGE";
  imageCount: number;
  imageWidth?: number | null;
  imageHeight?: number | null;
  quality?: string | null;
  /**
   * Reported by the provider. Used to price the call when the model has no
   * flat per-image rate -- gpt-image and Gemini bill images by token.
   */
  inputTokens?: number | null;
  outputTokens?: number | null;
  imagePriceInr: number | null;
  /** The row's token rates, for the token-billed branch. */
  rates?: TokenRates;
};

export type UsageOutcome = CaptionOutcome | ImageOutcome;

export type RecordUsageInput = {
  /**
   * Identity of one real provider invocation, minted by the caller before the
   * request goes out. See `newInvocationId`.
   */
  invocationId: string;
  attribution: UsageAttribution;
  outcome: UsageOutcome;
  status: "OK" | "FAILED";
  latencyMs?: number | null;
  errorMessage?: string | null;
  providerRequestId?: string | null;
  langfuseTraceId?: string | null;
  langfuseGenerationId?: string | null;
  isBackfilled?: boolean;
  /** Overrides `now()`, for backfilling historical rows at their real date. */
  createdAt?: Date;
};

/**
 * One id per real provider call.
 *
 * Minted immediately before the request rather than derived from run, attempt
 * and operation: a post renders its slides as separate activity executions
 * that each report attempt 1, so eight images in one run would collide on such
 * a key, and Gemini returns no request id to break the tie.
 */
export function newInvocationId(): string {
  return randomUUID();
}

function costFor(outcome: UsageOutcome): number | null {
  if (outcome.kind === "CAPTION") {
    return captionCostInr(
      { inputTokens: outcome.inputTokens, outputTokens: outcome.outputTokens },
      outcome.rates,
    );
  }
  return imageCostInr(
    outcome.imageCount,
    outcome.imagePriceInr,
    { inputTokens: outcome.inputTokens ?? null, outputTokens: outcome.outputTokens ?? null },
    outcome.rates,
  );
}

/**
 * Records the call, idempotently.
 *
 * An upsert on `invocationId`, so the rule holds exactly: one provider
 * invocation is one row. A retried *write* -- the activity crashing between
 * the provider responding and this returning, then Temporal running it again
 * with the same id -- updates rather than duplicates. A retried *call* mints a
 * new id and correctly produces a second row, because it was charged twice.
 *
 * Errors are not swallowed: unlike tracing, the ledger is the source of truth
 * for what was spent, and losing a write silently would understate the bill.
 */
export async function recordUsage(input: RecordUsageInput): Promise<{ id: string }> {
  const { attribution: a, outcome } = input;

  const data = {
    userId: a.userId,
    goalId: a.goalId ?? null,
    postId: a.postId ?? null,
    generationRunId: a.generationRunId ?? null,
    modelId: a.modelId ?? null,
    provider: a.provider,
    apiModelId: a.apiModelId,
    kind: outcome.kind,
    attempt: a.attempt ?? null,

    inputTokens: outcome.inputTokens ?? null,
    outputTokens: outcome.outputTokens ?? null,
    cachedInputTokens: outcome.kind === "CAPTION" ? (outcome.cachedInputTokens ?? null) : null,

    imageCount: outcome.kind === "IMAGE" ? outcome.imageCount : null,
    imageWidth: outcome.kind === "IMAGE" ? (outcome.imageWidth ?? null) : null,
    imageHeight: outcome.kind === "IMAGE" ? (outcome.imageHeight ?? null) : null,
    quality: outcome.kind === "IMAGE" ? (outcome.quality ?? null) : null,

    costInr: costFor(outcome),
    latencyMs: input.latencyMs ?? null,
    status: input.status,
    errorMessage: input.errorMessage ?? null,
    providerRequestId: input.providerRequestId ?? null,
    langfuseTraceId: input.langfuseTraceId ?? null,
    langfuseGenerationId: input.langfuseGenerationId ?? null,
    isBackfilled: input.isBackfilled ?? false,
    ...(input.createdAt ? { createdAt: input.createdAt } : {}),
  };

  const row = await prisma.usageEvent.upsert({
    where: { invocationId: input.invocationId },
    create: { invocationId: input.invocationId, ...data },
    update: data,
    select: { id: true },
  });

  return row;
}
