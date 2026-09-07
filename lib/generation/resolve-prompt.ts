/**
 * Turns a goal row plus workspace settings into generation parameters.
 *
 * This is the whole of "generation is driven by the goal". Everything the
 * pipeline needs to render a post is decided here, from stored configuration,
 * and nothing downstream may substitute a topic or a style of its own. The
 * function is pure so that decision is testable without a database, a queue or
 * a provider.
 *
 * Resolution is three tiers throughout: the goal wins, then workspace
 * settings, then a built-in default. A goal that configures nothing still
 * generates; a goal that configures everything is obeyed exactly.
 */

import {
  DIAGRAM_STYLES,
  isVisualStyle,
  type AspectRatio,
  type VisualStyle,
} from "@/prompt/image-generator";
import type { Platform } from "@/lib/types";

/** The `infographicDetails` shape, as stored on the goal and read back here. */
export type InfographicDetails = {
  headerTitle?: string;
  subtitle?: string;
  flowchartNodes?: string[];
  metricsText?: string;
  takeawayQuote?: string;
  timelineSteps?: string[];
  badges?: string[];
};

/** Only the goal fields generation reads. Keeps the signature testable. */
export type GoalConfig = {
  id: string;
  name: string;
  imagePrompt: string | null;
  captionPrompt: string | null;
  visualStyle: string | null;
  slideCount: number | null;
  infographicDetails: unknown;
  recentTopics: unknown;
  brandLogoAssetId: string | null;
  referenceAssetIds: string[];
  imageAssetIds: string[];
  modelId: string | null;
};

/**
 * How the goal's wording becomes an image prompt.
 *
 * `verbatim` sends `imagePrompt` to the model exactly as written. `composed`
 * runs it through the style presets, which wrap it in directives for lighting,
 * camera, palette and mood.
 *
 * Choosing a style is what opts into composition. A goal whose prompt already
 * dictates "24mm wide-angle, eye-level, photorealistic, no text" must not have
 * "Sleek 3D clay and glass abstract render" prepended to it — composition
 * helps a terse prompt and ruins a precise one, and only the author knows
 * which they wrote.
 */
export type PromptMode = "verbatim" | "composed";

export type ResolvedGeneration = {
  goalId: string;
  platform: Platform;
  /** The stored wording today's topic is derived from — never a literal topic. */
  topicSeed: string;
  captionSeed: string;
  promptMode: PromptMode;
  style: VisualStyle;
  aspectRatio: AspectRatio;
  slideCount: number;
  /**
   * Whether to route through the diagram prompt builder.
   *
   * True needs both a diagram style *and* details to draw: the builder can
   * only describe nodes, timelines and metrics it was given, so asking for a
   * diagram without them yields a header and nothing else.
   */
  useDiagramBuilder: boolean;
  infographicDetails: InfographicDetails | null;
  /** Topics this goal already used, so today's can be told to differ. */
  recentTopics: string[];
  brandLogoAssetId: string | null;
  referenceAssetIds: string[];
  imageAssetIds: string[];
  modelId: string | null;
};

/** Fallbacks of last resort, when neither goal nor workspace says otherwise. */
export const GENERATION_DEFAULTS = {
  style: "3d-render" as VisualStyle,
  aspectRatio: { INSTAGRAM: "4:5", LINKEDIN: "1.91:1" } satisfies Record<Platform, AspectRatio>,
  slideCount: { INSTAGRAM: 8, LINKEDIN: 6 } satisfies Record<Platform, number>,
  /** How many previous topics to hand the model as "do not repeat these". */
  recentTopicWindow: 10,
} as const;

/** Aspect ratios the settings form can offer per platform. */
const SETTINGS_RATIO_KEY: Record<Platform, string> = {
  INSTAGRAM: "igRatio",
  LINKEDIN: "liRatio",
};

const SETTINGS_SLIDES_KEY: Record<Platform, string> = {
  INSTAGRAM: "igSlides",
  LINKEDIN: "liSlides",
};

const ASPECT_RATIOS: AspectRatio[] = ["1:1", "4:5", "1.91:1", "16:9", "9:16"];

function isAspectRatio(v: unknown): v is AspectRatio {
  return typeof v === "string" && (ASPECT_RATIOS as string[]).includes(v);
}

/** The settings blob is opaque JSON, so every read of it is defensive. */
function readSettings(settings: unknown): Record<string, unknown> {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return {};
  return settings as Record<string, unknown>;
}

function nonEmpty(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

function stringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  return out.length > 0 ? out : undefined;
}

/**
 * Reads stored `infographicDetails` into the builder's shape.
 *
 * Returns null when nothing usable survives, which is what makes the diagram
 * path ineligible rather than fabricated.
 */
export function parseInfographicDetails(raw: unknown): InfographicDetails | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;

  const details: InfographicDetails = {};
  const headerTitle = nonEmpty(r.headerTitle);
  const subtitle = nonEmpty(r.subtitle);
  const metricsText = nonEmpty(r.metricsText);
  const takeawayQuote = nonEmpty(r.takeawayQuote);
  const flowchartNodes = stringArray(r.flowchartNodes);
  const timelineSteps = stringArray(r.timelineSteps);
  const badges = stringArray(r.badges);

  if (headerTitle) details.headerTitle = headerTitle;
  if (subtitle) details.subtitle = subtitle;
  if (metricsText) details.metricsText = metricsText;
  if (takeawayQuote) details.takeawayQuote = takeawayQuote;
  if (flowchartNodes) details.flowchartNodes = flowchartNodes;
  if (timelineSteps) details.timelineSteps = timelineSteps;
  if (badges) details.badges = badges;

  return Object.keys(details).length > 0 ? details : null;
}

/** The last N topics this goal produced, newest last. */
export function parseRecentTopics(raw: unknown, limit = GENERATION_DEFAULTS.recentTopicWindow): string[] {
  const list = stringArray(raw) ?? [];
  return list.slice(-limit);
}

/**
 * A diagram needs more than a header to be worth drawing: at minimum a
 * flowchart, a timeline, or metrics. A title and a quote alone describe no
 * structure, and the builder would emit a near-empty layout directive.
 */
function hasDrawableStructure(details: InfographicDetails | null): boolean {
  if (!details) return false;
  return (
    (details.flowchartNodes?.length ?? 0) > 0 ||
    (details.timelineSteps?.length ?? 0) > 0 ||
    !!details.metricsText
  );
}

export function resolveGeneration(
  goal: GoalConfig,
  settings: unknown,
  platform: Platform,
): ResolvedGeneration {
  const st = readSettings(settings);

  // Topic seed: the goal's own wording first. Falling back to the goal name
  // rather than to any literal subject keeps every generated post traceable to
  // something the user wrote.
  const topicSeed =
    nonEmpty(goal.imagePrompt) ?? nonEmpty(st.imagePrompt) ?? goal.name;

  const captionSeed =
    nonEmpty(goal.captionPrompt) ?? nonEmpty(st.captionPrompt) ?? topicSeed;

  const goalStyle = isVisualStyle(goal.visualStyle) ? goal.visualStyle : null;
  const settingsStyle = isVisualStyle(st.defaultVisualStyle) ? st.defaultVisualStyle : null;
  const style = goalStyle ?? settingsStyle ?? GENERATION_DEFAULTS.style;

  // No style chosen anywhere means the prompt is used as written. `style`
  // below is still resolved, because the diagram check and the composed path
  // need a value, but it does not reach the model in verbatim mode.
  const promptMode: PromptMode = goalStyle || settingsStyle ? "composed" : "verbatim";

  const settingsRatio = st[SETTINGS_RATIO_KEY[platform]];
  const aspectRatio = isAspectRatio(settingsRatio)
    ? settingsRatio
    : GENERATION_DEFAULTS.aspectRatio[platform];

  const settingsSlides = st[SETTINGS_SLIDES_KEY[platform]];
  const slideCount = normaliseSlideCount(
    goal.slideCount ??
      (typeof settingsSlides === "number" ? settingsSlides : null) ??
      GENERATION_DEFAULTS.slideCount[platform],
  );

  const infographicDetails = parseInfographicDetails(goal.infographicDetails);

  return {
    goalId: goal.id,
    platform,
    topicSeed,
    captionSeed,
    promptMode,
    style,
    aspectRatio,
    slideCount,
    useDiagramBuilder:
      promptMode === "composed" &&
      DIAGRAM_STYLES.includes(style) &&
      hasDrawableStructure(infographicDetails),
    infographicDetails,
    recentTopics: parseRecentTopics(goal.recentTopics),
    brandLogoAssetId: nonEmpty(goal.brandLogoAssetId),
    referenceAssetIds: goal.referenceAssetIds ?? [],
    imageAssetIds: goal.imageAssetIds ?? [],
    modelId: nonEmpty(goal.modelId),
  };
}

/**
 * Instagram caps a carousel at 10 and a post needs at least one slide, so a
 * stored 0, a negative, or a fractional count cannot be passed through — the
 * pipeline would either render nothing or be rejected at publish.
 */
export function normaliseSlideCount(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(Math.max(Math.trunc(n), 1), 10);
}
