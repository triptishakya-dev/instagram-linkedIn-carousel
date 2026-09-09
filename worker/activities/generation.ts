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
import { Context } from "@temporalio/activity";
import { pickImageModel, pickTextModel, type ModelRow } from "@/lib/generation/pick-model";
import { newInvocationId, recordUsage } from "@/lib/usage/record";
import {
  resolveGeneration,
  type GoalConfig,
  type ResolvedGeneration,
} from "@/lib/generation/resolve-prompt";
import { loadReferenceImages, resolveReferenceAssets } from "@/lib/generation/load-references";
import {
  referenceCandidatesForSlide,
  selectReferenceAssets,
  type ReferenceAssetRef,
} from "@/lib/generation/reference-image";
import { publicUrlFor, putObject } from "@/lib/s3";
import { IMAGE_SYSTEM_RULES, SYSTEM_RULES_VERSION } from "@/prompt/system-rules";
import type { Platform } from "@/lib/types";
import {
  DEFAULT_NEGATIVE_PROMPT,
  buildCarouselPrompts,
  buildImagePrompt,
  buildTechInfographicPrompt,
  withReferenceGuidance,
} from "@/prompt/image-generator";

/* ------------------------------------------------------------------- types -- */

/** One slide's wording, before its reference assets are attached. */
export type BuiltPrompt = {
  order: number;
  prompt: string;
  negativePrompt: string;
};

export type SlidePrompt = BuiltPrompt & {
  /**
   * The assets this slide is to be given as image inputs.
   *
   * Keys and metadata, never bytes: this travels through workflow history, and
   * `load-references.ts` explains why an image must not. Empty is the ordinary
   * case — a goal with no assets attached — and leaves the render on exactly
   * the text-only path it took before.
   */
  references: ReferenceAssetRef[];
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
  /**
   * Reference assets the goal named that will not reach the model, and why.
   *
   * Surfaced on the run rather than logged, because a user who attached a
   * reference and got a picture that ignores it needs to be told the file was a
   * PDF, or has been deleted — silence there is the bug this change removes.
   */
  referenceNotes: string[];
  /**
   * The standing rules every slide in this run is generated under.
   *
   * Carried on the plan rather than read from the module inside the adapter, so
   * one run is generated under one ruleset: a slide that retries an hour after a
   * deploy gets the rules its siblings got, not the new ones. It also means the
   * ruleset is in workflow history, which is the only durable record of what a
   * given image was actually told.
   */
  systemRules: string;
  /** Which ruleset the line above is, for the run note and for reading back. */
  systemRulesVersion: string;
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

  const built = buildSlidePrompts(resolved);

  /* ---- the reference assets those prompts are drawn against ---- */

  // Resolved once for the post and then narrowed per slide. The logo and the
  // style references apply to every slide; `imageAssetIds` is index-matched to
  // slide order, the way the goal editor's "order maps to slide order" says.
  //
  // Metadata only. `Asset.sizeBytes` is enough to enforce the per-call budget,
  // so nothing is downloaded here — the bytes are read inside
  // `renderSlideActivity`, which is the only place they can be without being
  // written into workflow history.
  const assets = await resolveReferenceAssets({
    userId: input.userId,
    logoAssetId: resolved.brandLogoAssetId,
    referenceAssetIds: resolved.referenceAssetIds,
    imageAssetIds: resolved.imageAssetIds,
  });

  const referenceNotes: string[] = [];

  if (assets.missing.length > 0) {
    referenceNotes.push(
      assets.missing.length === 1
        ? "One reference asset this goal names is no longer in the library, so it was not used."
        : `${assets.missing.length} reference assets this goal names are no longer in the library, so they were not used.`,
    );
  }

  // Deduplicated across slides: the same asset is skipped for the same reason
  // on all eight of them, and eight identical notes would bury the ones that
  // differ.
  const noted = new Set<string>();

  const slides: SlidePrompt[] = built.map((slide) => {
    const { selected, skipped } = selectReferenceAssets(
      referenceCandidatesForSlide({
        order: slide.order,
        logo: assets.logo,
        slideSources: assets.slideSources,
        references: assets.references,
      }),
    );

    for (const skip of skipped) {
      const note = `Reference "${skip.name}" was not sent to the image model: ${skip.reason}.`;
      if (noted.has(note)) continue;
      noted.add(note);
      referenceNotes.push(note);
    }

    return { ...slide, references: selected };
  });

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
    referenceNotes,
    systemRules: IMAGE_SYSTEM_RULES,
    systemRulesVersion: SYSTEM_RULES_VERSION,
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
export function buildSlidePrompts(resolved: ResolvedGeneration): BuiltPrompt[] {
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
  /** Attribution for the usage ledger; the call is billed to this run and goal. */
  goalId?: string | null;
  generationRunId?: string | null;
  order: number;
  prompt: string;
  negativePrompt: string;
  aspectRatio: string;
  imageModel: string;
  /** The `AiModel` row behind `imageModel`, whose stored key is used if it has one. */
  imageModelRowId?: string | null;
  /**
   * Assets to hand the model as visual references for this slide, already
   * selected and ordered by `planGenerationActivity`. Keys, not bytes.
   */
  references?: ReferenceAssetRef[];
  /**
   * The standing rules for this render, from the plan.
   *
   * Optional so an older workflow replaying from history -- whose plan has no
   * such field -- renders exactly as it did, rather than failing on a shape it
   * was never given.
   */
  systemRules?: string;
}): Promise<RenderedSlide> {
  const apiKey = await modelApiKey(input.imageModelRowId);
  const billing = await modelBilling(input.imageModelRowId);

  // The reference bytes are read here and nowhere earlier. Fetching them during
  // planning would put a picture in an activity result, and therefore in
  // workflow history for its whole retention period — the same rule the file
  // header sets for generated bytes, applied to the inputs.
  //
  // Before the provider call, and before the invocation id is minted: a
  // reference that cannot be read means no request goes out, so there is
  // nothing to bill and nothing to record.
  const references = await loadReferenceImages(input.references ?? []);

  // The pictures themselves are what the model works from. This adds the one
  // thing an attachment cannot say for itself — how much authority it carries
  // against the written prompt — and returns the prompt untouched when there
  // are no references, which is the ordinary case.
  const prompt = withReferenceGuidance(input.prompt, references);

  if (references.length > 0) {
    logSlideReferences(input.order, input.imageModel, references);
  }

  // Minted before the request, so it names this one invocation. A retry that
  // calls the provider again mints another and is billed as another.
  const invocationId = newInvocationId();
  const startedAt = Date.now();

  const attribution = {
    userId: input.userId,
    goalId: input.goalId ?? null,
    postId: input.postId,
    generationRunId: input.generationRunId ?? null,
    modelId: input.imageModelRowId ?? null,
    provider: billing.provider,
    apiModelId: input.imageModel,
    attempt: currentAttempt(),
  };

  let image;
  try {
    image = await renderImage({
      prompt,
      negativePrompt: input.negativePrompt,
      aspectRatio: input.aspectRatio as never,
      model: input.imageModel,
      apiKey,
      references,
      systemRules: input.systemRules,
    });
  } catch (err) {
    // A refused or failed image still consumed a request, and often a charge.
    // No token counts are invented for it: the provider reported none.
    await recordUsage({
      invocationId,
      attribution,
      outcome: {
        kind: "IMAGE",
        imageCount: 0,
        imagePriceInr: billing.imagePriceInr,
      },
      status: "FAILED",
      latencyMs: Date.now() - startedAt,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  await recordUsage({
    invocationId,
    attribution,
    outcome: {
      kind: "IMAGE",
      imageCount: 1,
      imageWidth: image.width ?? null,
      imageHeight: image.height ?? null,
      quality: image.quality ?? null,
      inputTokens: image.inputTokens ?? null,
      outputTokens: image.outputTokens ?? null,
      imagePriceInr: billing.imagePriceInr,
      // gpt-image bills by token and returns the counts, so the row's token
      // rates price it when no flat per-image rate is set.
      rates: billing.rates,
    },
    status: "OK",
    latencyMs: Date.now() - startedAt,
    providerRequestId: image.requestId ?? null,
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
        // The composed prompt, not the planned one. This column is the audit
        // trail for what produced the image, and with references attached the
        // planned wording is only part of the request — the composed text
        // names every picture that went with it.
        prompt,
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
/**
 * The pricing and provider a model row carries, for the usage ledger.
 *
 * Separate from `modelApiKey` because it reads no secret and must not fail the
 * call: a row with no image price is a gap to report as "not priced", not a
 * reason to refuse to generate.
 */
async function modelBilling(modelRowId: string | null | undefined): Promise<{
  provider: string;
  imagePriceInr: number | null;
  rates: { inputPricePerMTokInr: number; outputPricePerMTokInr: number };
}> {
  const row = modelRowId
    ? await prisma.aiModel.findUnique({
        where: { id: modelRowId },
        select: {
          provider: true,
          imagePriceInr: true,
          inputPricePerMTokInr: true,
          outputPricePerMTokInr: true,
        },
      })
    : null;

  return {
    provider: row?.provider ?? "unknown",
    imagePriceInr: row?.imagePriceInr ?? null,
    rates: {
      inputPricePerMTokInr: row?.inputPricePerMTokInr ?? 0,
      outputPricePerMTokInr: row?.outputPricePerMTokInr ?? 0,
    },
  };
}

/**
 * Records which pictures went to the provider with a slide.
 *
 * Names and byte counts only. The bytes themselves are never logged: a base64
 * reference image would be megabytes of log line per slide, and the useful
 * question a log answers here is "was the reference actually sent", which a
 * name and a size answer.
 *
 * Temporal's logger is used through the activity context and swallowed when
 * there is none, the same way `currentAttempt` is, so this stays callable from
 * a plain unit test.
 */
function logSlideReferences(
  order: number,
  model: string,
  references: readonly { name: string; role: string; mime: string; bytes: Buffer }[],
): void {
  try {
    Context.current().log.info("Slide references sent to image model", {
      order,
      model,
      count: references.length,
      references: references.map((ref) => ({
        name: ref.name,
        role: ref.role,
        mime: ref.mime,
        bytes: ref.bytes.byteLength,
      })),
    });
  } catch {
    // Not running inside an activity; there is nowhere to log to.
  }
}

/**
 * Temporal's attempt counter for the running activity.
 *
 * Attribution only -- a retry that actually called the provider again gets its
 * own `invocationId` and its own row, because it was charged again. Falls back
 * to null outside an activity context, which is how the unit tests call in.
 */
function currentAttempt(): number | null {
  try {
    return Context.current().info.attempt;
  } catch {
    return null;
  }
}

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
  /** Attribution for the usage ledger; the call is billed to this run and goal. */
  userId: string;
  goalId?: string | null;
  generationRunId?: string | null;
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
  const billing = await modelBilling(input.textModelRowId);

  // Minted before the request, so it names this one invocation.
  const invocationId = newInvocationId();
  const startedAt = Date.now();

  const attribution = {
    userId: input.userId,
    goalId: input.goalId ?? null,
    postId: input.postId,
    generationRunId: input.generationRunId ?? null,
    modelId: input.textModelRowId ?? null,
    provider: billing.provider,
    apiModelId: input.textModel,
    attempt: currentAttempt(),
  };

  let result;
  try {
    result = await chatCompletion({
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
  } catch (err) {
    // Null rather than zero: the provider reported no usage, which is not the
    // same as a call that used none. Zero would read as a free call.
    await recordUsage({
      invocationId,
      attribution,
      outcome: { kind: "CAPTION", inputTokens: null, outputTokens: null, rates: input.rates },
      status: "FAILED",
      latencyMs: Date.now() - startedAt,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  await recordUsage({
    invocationId,
    attribution,
    outcome: {
      kind: "CAPTION",
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      cachedInputTokens: result.usage.cachedInputTokens,
      rates: input.rates,
    },
    status: "OK",
    latencyMs: Date.now() - startedAt,
    providerRequestId: result.requestId,
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
