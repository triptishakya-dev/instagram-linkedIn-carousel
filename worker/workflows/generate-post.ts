/**
 * Generation workflows.
 *
 * Workflow code is replayed from history on recovery, so it holds no business
 * logic, no prompt building and no clock reads — only orchestration. Anything
 * that could return a different answer on a later replay lives in an activity.
 *
 * Imports here are deliberately limited to `@temporalio/workflow` and a
 * type-only import of the activities, because Temporal bundles this file
 * separately from the rest of the app.
 */

import { proxyActivities, workflowInfo } from "@temporalio/workflow";
import type * as activities from "../activities/generation";

const {
  markRunRunningActivity,
  finishRunActivity,
  planGenerationActivity,
  createPostActivity,
  renderSlideActivity,
  generateCaptionActivity,
  finalisePostActivity,
} = proxyActivities<typeof activities>({
  // Image generation is the slow step; a single slide can take well over a
  // minute on the pro model.
  startToCloseTimeout: "5 minutes",
  retry: {
    initialInterval: "3 seconds",
    backoffCoefficient: 2,
    maximumAttempts: 3,
    // A prompt the model refuses, a missing key, or a model that does not
    // exist will fail identically on every attempt. Retrying those three
    // burns minutes and quota to reach the same error.
    nonRetryableErrorTypes: ["GenerationError"],
  },
});

export type GeneratePostParams = {
  userId: string;
  goalId: string;
  runId: string;
  platform: "INSTAGRAM" | "LINKEDIN";
  /** `YYYY-MM-DD`, supplied by the caller so replays reuse the same key. */
  dateKey: string;
  slideCountOverride?: number;
};

export type GeneratePostOutput = {
  postId: string;
  platform: string;
  slidesRendered: number;
  slidesFailed: number;
  captionWritten: boolean;
  notes: string[];
};

/**
 * One post, end to end: plan, create, render every slide, caption, finalise.
 *
 * Slides are rendered sequentially rather than in parallel. The provider rate
 * limits hard on concurrent image requests, and a carousel that fails half its
 * slides to a 429 is worse than one that takes longer.
 */
export async function generatePostWorkflow(
  params: GeneratePostParams,
): Promise<GeneratePostOutput> {
  const startedAt = Date.now();
  const notes: string[] = [];

  const plan = await planGenerationActivity({
    userId: params.userId,
    goalId: params.goalId,
    platform: params.platform,
    slideCountOverride: params.slideCountOverride,
  });

  if (plan.fallbackReason) notes.push(plan.fallbackReason);

  const { postId, replayed } = await createPostActivity({
    userId: params.userId,
    goalId: params.goalId,
    runId: params.runId,
    platform: params.platform,
    topic: plan.topic,
    dateKey: params.dateKey,
  });

  if (replayed) notes.push(`Reused the existing post for ${params.platform} on ${params.dateKey}.`);

  // Rendered slides are counted from the database in `finalisePostActivity`
  // rather than tallied here: a replayed workflow would double-count, and the
  // row count is the truth anyway.
  let slidesFailed = 0;

  for (const slide of plan.slides) {
    try {
      await renderSlideActivity({
        userId: params.userId,
        postId,
        order: slide.order,
        prompt: slide.prompt,
        negativePrompt: slide.negativePrompt,
        aspectRatio: plan.aspectRatio,
        imageModel: plan.imageModel,
      });
    } catch (err) {
      // One refused or failed slide must not cost the whole post: the others
      // are already in storage and the draft is still usable.
      slidesFailed += 1;
      notes.push(`Slide ${slide.order + 1} failed: ${describe(err)}`);
    }
  }

  let caption: string | null = null;
  let inputTokens = 0;
  let outputTokens = 0;
  let estimatedCostInr = 0;

  try {
    const written = await generateCaptionActivity({
      postId,
      captionSeed: plan.captionSeed,
      topic: plan.topic,
      platform: params.platform,
      textModel: plan.textModel,
      rates: plan.rates,
    });
    caption = written.caption;
    inputTokens = written.inputTokens;
    outputTokens = written.outputTokens;
    estimatedCostInr = written.estimatedCostInr;
  } catch (err) {
    notes.push(`Caption failed: ${describe(err)}`);
  }

  const { mediaCount } = await finalisePostActivity({
    postId,
    goalId: params.goalId,
    caption,
    topic: plan.topic,
    modelRowId: plan.textModelRowId,
    inputTokens,
    outputTokens,
    estimatedCostInr,
    generationMs: Date.now() - startedAt,
  });

  return {
    postId,
    platform: params.platform,
    slidesRendered: mediaCount,
    slidesFailed,
    captionWritten: caption !== null,
    notes,
  };
}

export type GenerateForGoalParams = {
  userId: string;
  goalId: string;
  runId: string;
  platforms: ("INSTAGRAM" | "LINKEDIN")[];
  dateKey: string;
  slideCountOverride?: number;
};

/**
 * A whole run: one post per targeted platform, then the run row is closed out.
 *
 * `finishRunActivity` is in a finally-shaped position so a run always reaches a
 * terminal status. A run stuck at RUNNING forever is the one outcome the UI
 * cannot explain to anybody.
 */
export async function generateForGoalWorkflow(params: GenerateForGoalParams) {
  const info = workflowInfo();
  await markRunRunningActivity(params.runId, info.workflowId, info.runId);

  const results: GeneratePostOutput[] = [];
  const notes: string[] = [];

  try {
    for (const platform of params.platforms) {
      try {
        const result = await generatePostWorkflow({
          userId: params.userId,
          goalId: params.goalId,
          runId: params.runId,
          platform,
          dateKey: params.dateKey,
          slideCountOverride: params.slideCountOverride,
        });
        results.push(result);
        notes.push(...result.notes);
      } catch (err) {
        notes.push(`${platform} failed: ${describe(err)}`);
      }
    }

    const produced = results.filter((r) => r.slidesRendered > 0 || r.captionWritten);

    // Notes are not failures. A run that produced everything it was asked for
    // but substituted a model is COMPLETED with a warning attached; calling it
    // PARTIAL would make a healthy run look broken and hide the real ones.
    const incomplete =
      params.platforms.length - produced.length > 0 ||
      results.some((r) => r.slidesFailed > 0 || !r.captionWritten);

    const status =
      produced.length === 0 ? "FAILED" : incomplete ? "PARTIAL" : "COMPLETED";

    await finishRunActivity({
      runId: params.runId,
      status,
      postCount: produced.length,
      note: notes.length ? notes.join("\n") : null,
    });

    return { status, posts: results, notes };
  } catch (err) {
    await finishRunActivity({
      runId: params.runId,
      status: "FAILED",
      postCount: results.length,
      note: [...notes, describe(err)].join("\n"),
    });
    throw err;
  }
}

/** Message text from anything thrown, without assuming it is an Error. */
function describe(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}
