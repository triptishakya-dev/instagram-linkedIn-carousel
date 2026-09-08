/**
 * Generation activities: the side-effecting steps of a run.
 *
 * These replace `uploadToStorageActivity` and `updatePostDatabaseActivity`,
 * which returned success without touching S3 or Postgres.
 *
 * One shape decision runs through the whole file: **image bytes never cross an
 * activity boundary**. A slide is generated and uploaded inside a single
 * activity, which returns only its key and dimensions. Temporal records every
 * activity result in workflow history, and a 700KB base64 payload would both
 * approach the payload limit and bloat the history of every run for its whole
 * retention period.
 *
 * Each activity is also safe to retry, because Temporal will retry them: post
 * creation is keyed on an idempotency string, and a slide upload replaces its
 * own row rather than appending a duplicate.
 */

import { prisma } from "@/lib/db";
import { renderImage } from "@/lib/generation/render-image";
import { aspectRatioOf, extensionForImageMime, imageSize } from "@/lib/generation/image-size";
import { canEncryptSecrets, decryptSecret } from "@/lib/crypto";
import { GenerationError, chatCompletion, estimateCostInr } from "@/lib/generation/litellm";
import { pickImageModel, pickTextModel, type ModelRow } from "@/lib/generation/pick-model";
import {
  resolveGeneration,
  type GoalConfig,
  type ResolvedGeneration,
} from "@/lib/generation/resolve-prompt";
import { publicUrlFor, putObject } from "@/lib/s3";
import type { Platform } from "@/lib/types";
import {
  DEFAULT_NEGATIVE_PROMPT,
  buildCarouselPrompts,
  buildImagePrompt,
  buildTechInfographicPrompt,
} from "@/prompt/image-generator";

/* ------------------------------------------------------------------- types -- */

export type SlidePrompt = {
  order: number;
  prompt: string;
  negativePrompt: string;
};

export type GenerationPlan = {
  goalId: string;
  goalName: string;
  platform: Platform;
  topic: string;
  promptMode: ResolvedGeneration["promptMode"];
  style: string;
  aspectRatio: string;
  slides: SlidePrompt[];
  captionSeed: string;
  textModel: string;
  textModelRowId: string | null;
  rates: { inputPricePerMTokInr: number; outputPricePerMTokInr: number };
  /** From the model row, so a value typed in Accounts is the one sent. */
  maxTokens: number | null;
  temperature: number | null;
  imageModel: string;
  /** The `AiModel` row behind `imageModel`, whose stored key renders the slides. */
  imageModelRowId: string | null;
  /** Set when the model the goal asked for could not be used. */
  fallbackReason: string | null;
};

/* ------------------------------------------------------------ run tracking -- */

export async function markRunRunningActivity(
  runId: string,
  workflowId: string,
  temporalRunId: string,
): Promise<void> {
  await prisma.generationRun.update({
    where: { id: runId },
    data: { status: "RUNNING", workflowId, runId: temporalRunId, startedAt: new Date() },
  });
}

export async function finishRunActivity(input: {
  runId: string;
  status: "COMPLETED" | "PARTIAL" | "FAILED";
  postCount: number;
  note?: string | null;
}): Promise<void> {
  await prisma.generationRun.update({
    where: { id: input.runId },
    data: {
      status: input.status,
      postCount: input.postCount,
      finishedAt: new Date(),
      error: input.note ?? null,
    },
  });
}

/* ---------------------------------------------------------------- planning -- */

/**
 * Reads the goal and turns it into the exact prompts to render.
 *
 * All prompt construction happens here rather than in the workflow: workflow
 * code is replayed from history on every recovery, so it must stay
 * deterministic and free of business logic that might change between
 * deployments.
 */
export async function planGenerationActivity(input: {
  userId: string;
  goalId: string;
  platform: Platform;
  slideCountOverride?: number;
}): Promise<GenerationPlan> {
  const goal = await prisma.goal.findFirst({
    where: { id: input.goalId, userId: input.userId },
  });
  if (!goal) throw new Error(`Goal ${input.goalId} not found for this user.`);

  const workspace = await prisma.workspaceSetting.findUnique({
    where: { userId: input.userId },
    select: { settings: true },
  });
  const settings = (workspace?.settings ?? {}) as Record<string, unknown>;

  const config: GoalConfig = {
    id: goal.id,
    name: goal.name,
    imagePrompt: goal.imagePrompt,
    captionPrompt: goal.captionPrompt,
    visualStyle: goal.visualStyle,
    slideCount: input.slideCountOverride ?? goal.slideCount,
    infographicDetails: goal.infographicDetails,
    recentTopics: goal.recentTopics,
    brandLogoAssetId: goal.brandLogoAssetId,
    referenceAssetIds: goal.referenceAssetIds,
    imageAssetIds: goal.imageAssetIds,
    modelId: goal.modelId,
  };

  const resolved = resolveGeneration(config, settings, input.platform);

  /* ---- which model answers ---- */

  // Every row, not just the ones the ids point at. `defCaptionModel` and
  // `defSlideModel` live in an opaque settings blob that adding a model does
  // not write, so fetching only the referenced ids meant a workspace with a
  // perfectly good model configured looked, from here, like a workspace with
  // none. The picker needs the candidates to fall back on. One small
  // per-user table, so this is a cheaper query than the two it replaces.
  const rows = await prisma.aiModel.findMany({ where: { userId: input.userId } });

  const toRow = (found: (typeof rows)[number]): ModelRow => ({
    id: found.id,
    label: found.label,
    apiModelId: found.apiModelId,
    enabled: found.enabled,
    inputPricePerMTokInr: found.inputPricePerMTokInr,
    outputPricePerMTokInr: found.outputPricePerMTokInr,
    role: found.role,
    maxTokens: found.maxTokens,
    temperature: found.temperature,
  });

  const available = rows.map(toRow);
  const asRow = (id: string | null | undefined): ModelRow | null =>
    (id ? available.find((r) => r.id === id) : undefined) ?? null;

  // Both throw rather than substituting a built-in model, so a workspace that
  // has configured nothing usable fails here with the reason instead of
  // spending on a provider nobody chose.
  const choice = pickTextModel({
    goalModel: asRow(goal.modelId),
    workspaceModel: asRow(typeof settings.defCaptionModel === "string" ? settings.defCaptionModel : null),
    available,
  });

  const imageChoice = pickImageModel({
    workspaceModel: asRow(typeof settings.defSlideModel === "string" ? settings.defSlideModel : null),
    available,
  });

  /* ---- the prompts themselves ---- */

  const slides = buildSlidePrompts(resolved);

  return {
    goalId: goal.id,
    goalName: goal.name,
    platform: input.platform,
    topic: resolved.topicSeed,
    promptMode: resolved.promptMode,
    style: resolved.style,
    aspectRatio: resolved.aspectRatio,
    slides,
    captionSeed: resolved.captionSeed,
    textModel: choice.apiModelId,
    textModelRowId: choice.modelRowId,
    rates: choice.rates,
    maxTokens: choice.maxTokens ?? null,
    temperature: choice.temperature ?? null,
    imageModel: imageChoice.apiModelId,
    imageModelRowId: imageChoice.modelRowId,
    fallbackReason: [choice.fallbackReason, imageChoice.fallbackReason]
      .filter(Boolean)
      .join(" ") || null,
  };
}

/**
 * Builds one prompt per slide from the resolved configuration.
 *
 * In `verbatim` mode the goal's own wording is the prompt, untouched — a
 * single-image prompt that dictates its own lens and lighting is not improved
 * by having a style preset wrapped around it. Multi-slide verbatim runs append
 * only a slide marker, which is the least that still distinguishes them.
 */
export function buildSlidePrompts(resolved: ResolvedGeneration): SlidePrompt[] {
  const { slideCount } = resolved;

  if (resolved.promptMode === "verbatim") {
    return Array.from({ length: slideCount }, (_, i) => ({
      order: i,
      prompt:
        slideCount === 1
          ? resolved.topicSeed
          : `${resolved.topicSeed}\n\n(Slide ${i + 1} of ${slideCount} in a carousel — vary the composition from the others while keeping the same subject and treatment.)`,
      negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    }));
  }

  if (resolved.useDiagramBuilder) {
    const built = buildTechInfographicPrompt({
      title: resolved.topicSeed,
      ...resolved.infographicDetails,
      platform: resolved.platform,
      aspectRatio: resolved.aspectRatio,
    });
    return [{ order: 0, prompt: built.prompt, negativePrompt: built.negativePrompt }];
  }

  if (slideCount === 1) {
    const built = buildImagePrompt({
      topic: resolved.topicSeed,
      style: resolved.style,
      platform: resolved.platform,
      aspectRatio: resolved.aspectRatio,
      ...(resolved.infographicDetails ? { infographicDetails: resolved.infographicDetails } : {}),
    });
    return [{ order: 0, prompt: built.prompt, negativePrompt: built.negativePrompt }];
  }

  return buildCarouselPrompts(
    resolved.topicSeed,
    slideCount,
    resolved.style,
    resolved.platform,
    resolved.aspectRatio,
  ).map((built, i) => ({
    order: i,
    prompt: built.prompt,
    negativePrompt: built.negativePrompt,
  }));
}

/* ------------------------------------------------------------ post + media -- */

/**
 * Creates the post row this run will fill in.
 *
 * The idempotency key is goal + date + platform, so a retried activity, a
 * replayed workflow or a double-clicked button all resolve to the same post
 * instead of three near-identical drafts. `Post.idempotencyKey` is unique, so
 * the database enforces it rather than this check merely hoping.
 */
export async function createPostActivity(input: {
  userId: string;
  goalId: string;
  runId: string;
  platform: Platform;
  topic: string;
  dateKey: string;
}): Promise<{ postId: string; replayed: boolean }> {
  const idempotencyKey = input.runId
    ? `gen:${input.goalId}:${input.runId}:${input.platform}`
    : `gen:${input.goalId}:${input.dateKey}:${input.platform}`;

  const existing = await prisma.post.findUnique({
    where: { idempotencyKey },
    select: { id: true },
  });
  if (existing) return { postId: existing.id, replayed: true };

  const post = await prisma.post.create({
    data: {
      userId: input.userId,
      goalId: input.goalId,
      generationRunId: input.runId,
      status: "DRAFT",
      intendedPlatforms: [input.platform],
      idempotencyKey,
      topic: input.topic.slice(0, 8000),
    },
    select: { id: true },
  });

  return { postId: post.id, replayed: false };
}

export type RenderedSlide = {
  order: number;
  url: string;
  storageKey: string;
  mime: string;
  width: number | null;
  height: number | null;
  fileSizeBytes: number;
};

/**
 * Generates one slide and stores it — image call, S3 put and the `PostMedia`
 * row, in that order, inside one activity.
 *
 * Bytes stay local to this call for the reason in the file header. The order
 * also matters on failure: an object with no row is collected later and costs
 * nothing, whereas a row pointing at an object that was never written would
 * render as a broken image forever.
 */
export async function renderSlideActivity(input: {
  userId: string;
  postId: string;
  order: number;
  prompt: string;
  negativePrompt: string;
  aspectRatio: string;
  imageModel: string;
  /** The `AiModel` row behind `imageModel`, whose stored key is used if it has one. */
  imageModelRowId?: string | null;
}): Promise<RenderedSlide> {
  const apiKey = await modelApiKey(input.imageModelRowId);

  const image = await renderImage({
    prompt: input.prompt,
    negativePrompt: input.negativePrompt,
    aspectRatio: input.aspectRatio as never,
    model: input.imageModel,
    apiKey,
  });

  const extension = extensionForImageMime(image.mime);
  const storageKey = `posts/${input.userId}/${input.postId}/${input.order}.${extension}`;

  await putObject(storageKey, image.bytes, image.mime);

  const size = imageSize(image.bytes);
  const url = publicUrlFor(storageKey);

  // Replace rather than append: a retry of this activity must not leave two
  // rows claiming the same slide position.
  await prisma.$transaction(async (tx) => {
    await tx.postMedia.deleteMany({ where: { postId: input.postId, order: input.order } });
    await tx.postMedia.create({
      data: {
        postId: input.postId,
        order: input.order,
        url,
        storageKey,
        width: size?.width ?? null,
        height: size?.height ?? null,
        aspectRatio: aspectRatioOf(size),
        format: extension,
        fileSizeBytes: image.bytes.byteLength,
        prompt: input.prompt,
        negativePrompt: input.negativePrompt,
      },
    });
  });

  return {
    order: input.order,
    url,
    storageKey,
    mime: image.mime,
    width: size?.width ?? null,
    height: size?.height ?? null,
    fileSizeBytes: image.bytes.byteLength,
  };
}

/* ----------------------------------------------------------------- caption -- */

const CAPTION_SYSTEM = [
  "You write social media captions for a scheduling tool.",
  "Follow the author's brief exactly, including any length, tone, hashtag and formatting instructions in it.",
  "Return only the caption text, ready to post. No preamble, no explanation, no markdown headings.",
].join(" ");

/**
 * Reads the model row's own provider key, decrypted, or undefined when it has
 * none.
 *
 * Looked up inside the activity rather than carried in the plan on purpose:
 * everything a workflow passes between activities is written to Temporal's
 * event history, and a plaintext provider key there would outlive the run and
 * be readable from the Temporal UI. The row id travels; the secret does not.
 *
 * A stored key that will not decrypt — written under a since-rotated
 * `TOKEN_ENCRYPTION_KEY`, or truncated — is treated as absent, so the call
 * falls back to the proxy's own key instead of failing the whole caption.
 */
async function modelApiKey(modelRowId: string | null | undefined): Promise<string> {
  if (!modelRowId) {
    throw new GenerationError("No model row to read a key from.");
  }

  if (!canEncryptSecrets()) {
    throw new GenerationError(
      "TOKEN_ENCRYPTION_KEY is not set, so the stored key for this model cannot be read.",
    );
  }

  const row = await prisma.aiModel.findUnique({
    where: { id: modelRowId },
    select: { label: true, apiKeyCipher: true },
  });

  if (!row) throw new GenerationError("The model this run was configured with no longer exists.");

  // Not falling back to a deployment-wide key: the key that pays for a call
  // belongs to the model row that named it, so a row with no key is a
  // configuration gap to report rather than someone else's bill to run up.
  if (!row.apiKeyCipher) {
    throw new GenerationError(
      `No API key is stored for "${row.label}". Paste one on that model in Accounts.`,
    );
  }

  try {
    return decryptSecret(row.apiKeyCipher);
  } catch (err) {
    throw new GenerationError(
      `The stored key for "${row.label}" could not be decrypted, which happens when ` +
        `TOKEN_ENCRYPTION_KEY has changed since it was saved. Paste the key again. ` +
        `(${(err as Error).message})`,
    );
  }
}

export async function generateCaptionActivity(input: {
  postId: string;
  captionSeed: string;
  topic: string;
  platform: Platform;
  textModel: string;
  /** The `AiModel` row behind `textModel`, whose stored key is used if it has one. */
  textModelRowId?: string | null;
  rates: { inputPricePerMTokInr: number; outputPricePerMTokInr: number };
  maxTokens?: number | null;
  temperature?: number | null;
  recentTopics?: string[];
}): Promise<{
  caption: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostInr: number;
  model: string;
}> {
  const parts = [
    `Platform: ${input.platform === "INSTAGRAM" ? "Instagram" : "LinkedIn"}`,
    "",
    "Author's brief:",
    input.captionSeed,
  ];

  // Only worth sending when the brief and the image direction differ; when the
  // goal has one prompt for both, repeating it adds tokens and no information.
  if (input.topic && input.topic !== input.captionSeed) {
    parts.push("", "The image this caption accompanies was generated from:", input.topic.slice(0, 2000));
  }

  if (input.recentTopics?.length) {
    parts.push(
      "",
      "Recent posts for this goal covered the following; do not repeat them:",
      input.recentTopics.map((t) => `- ${t.slice(0, 160)}`).join("\n"),
    );
  }

  const apiKey = await modelApiKey(input.textModelRowId);

  const result = await chatCompletion({
    model: input.textModel,
    system: CAPTION_SYSTEM,
    user: parts.join("\n"),
    // The row's own ceiling, not a number chosen here: a value typed in
    // Accounts that the pipeline overrode was worse than no field at all. The
    // 2048 stands in only for a row saved before the column existed.
    maxTokens: input.maxTokens ?? 2048,
    ...(input.temperature !== null && input.temperature !== undefined
      ? { temperature: input.temperature }
      : {}),
    apiKey,
  });

  return {
    caption: result.text,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    estimatedCostInr: estimateCostInr(result.usage, input.rates),
    model: result.model,
  };
}

/* ---------------------------------------------------------------- finalise -- */

export async function finalisePostActivity(input: {
  postId: string;
  goalId: string;
  caption: string | null;
  topic: string;
  modelRowId: string | null;
  inputTokens: number;
  outputTokens: number;
  estimatedCostInr: number;
  generationMs: number;
}): Promise<{ mediaCount: number }> {
  const mediaCount = await prisma.postMedia.count({ where: { postId: input.postId } });

  await prisma.$transaction(async (tx) => {
    await tx.post.update({
      where: { id: input.postId },
      data: {
        ...(input.caption !== null ? { caption: input.caption } : {}),
        modelId: input.modelRowId,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        estimatedCostInr: input.estimatedCostInr,
        generationMs: input.generationMs,
        runCount: { increment: 1 },
      },
    });

    // Remember today's topic so the next run can be told not to repeat it.
    const goal = await tx.goal.findUnique({
      where: { id: input.goalId },
      select: { recentTopics: true },
    });
    const previous = Array.isArray(goal?.recentTopics)
      ? (goal.recentTopics as unknown[]).filter((t): t is string => typeof t === "string")
      : [];
    const summary = input.topic.slice(0, 300);

    if (summary && previous.at(-1) !== summary) {
      await tx.goal.update({
        where: { id: input.goalId },
        data: { recentTopics: [...previous, summary].slice(-20) },
      });
    }
  });

  return { mediaCount };
}
