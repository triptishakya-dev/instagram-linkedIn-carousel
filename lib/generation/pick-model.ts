/**
 * Chooses which model actually gets called, and refuses when none can be.
 *
 * The `AiModel` rows are the only source of models and of the keys that pay
 * for them. There is deliberately no built-in fallback: a run that quietly
 * substituted a different provider's model spent someone's money on output
 * they did not configure and could not predict, and the substitution was only
 * visible as a note nobody reads. Nothing configured and usable is an error
 * with the reasons attached, not a silent redirect.
 *
 * "No built-in fallback" is not the same as "no fallback". When no default
 * names a usable row, the workspace's own rows are searched, and a single
 * eligible one is used and reported. That still only ever spends on a model
 * somebody configured -- it just stops requiring them to also remember to
 * point a settings key at it. An ambiguous search asks rather than guesses.
 *
 * Which models exist is not cross-checked against the proxy either. The proxy
 * routes whatever it is asked for using the key sent with the request, so the
 * database is the authority and a name it cannot serve fails at call time with
 * the provider's own message.
 */

import { GenerationError } from "./litellm";

export type ModelRow = {
  id: string;
  label: string;
  apiModelId: string | null;
  enabled: boolean;
  inputPricePerMTokInr: number;
  outputPricePerMTokInr: number;
  /** Which half of generation the row is allowed to serve. */
  role?: "CAPTION" | "SLIDES" | "BOTH";
  /** Token ceiling for one call, as configured on the row. */
  maxTokens?: number;
  temperature?: number;
};

export type ModelChoice = {
  /** The `model_name` to send to the proxy. */
  apiModelId: string;
  /** The `AiModel` row this came from, or null when nothing configured matched. */
  modelRowId: string | null;
  rates: { inputPricePerMTokInr: number; outputPricePerMTokInr: number };
  /**
   * The row's own call settings, so a value typed in Accounts is the one sent.
   * A reasoning model that cannot finish inside its budget returns nothing, so
   * this is load-bearing rather than cosmetic.
   */
  maxTokens?: number;
  temperature?: number;
  /**
   * Set when the goal's own model was not used. Surfaced on the run so the
   * substitution is visible rather than inferred from odd output.
   */
  fallbackReason: string | null;
};

function ratesOf(row: ModelRow) {
  return {
    inputPricePerMTokInr: row.inputPricePerMTokInr,
    outputPricePerMTokInr: row.outputPricePerMTokInr,
  };
}

/** The row's call settings, omitted rather than defaulted when unset. */
function callSettingsOf(row: ModelRow) {
  return {
    ...(row.maxTokens !== undefined ? { maxTokens: row.maxTokens } : {}),
    ...(row.temperature !== undefined ? { temperature: row.temperature } : {}),
  };
}

/** The parts of a choice that come straight off the row. */
function chosenFrom(row: ModelRow, fallbackReason: string | null): ModelChoice {
  return {
    apiModelId: row.apiModelId as string,
    modelRowId: row.id,
    rates: ratesOf(row),
    ...callSettingsOf(row),
    fallbackReason,
  };
}

/**
 * Why a row cannot serve this half of generation, or null when it can.
 *
 * One predicate for both halves, so "usable" means the same thing whether a
 * row was named explicitly or found by the search below. When these drifted
 * apart, a row could be rejected as a named default and then re-offered as a
 * candidate.
 */
function rejectionFor(row: ModelRow, kind: "caption" | "slides"): string | null {
  if (!row.enabled) return "is disabled.";
  if (!row.apiModelId) return "has no API model id set.";
  if (kind === "caption" && row.role === "SLIDES") return "is set to slides only.";
  if (kind === "slides" && row.role === "CAPTION") return "is set to captions only.";
  return null;
}

export type PickModelInput = {
  /** The row the goal names, if it names one that still exists. */
  goalModel: ModelRow | null;
  /** Workspace default, from `settings.defCaptionModel`. */
  workspaceModel: ModelRow | null;
  /**
   * Every model the workspace has configured, for the last resort below.
   *
   * The defaults above are ids held in an opaque settings blob, written by a
   * different screen from the one that creates models. Adding a model does not
   * set them, so "I configured a model and generation says I have none" was
   * the normal outcome of a first run rather than an edge case. Passing the
   * rows lets the pick be made from what exists instead of from a pointer
   * somebody has to remember to set.
   */
  available?: ModelRow[];
};

/**
 * Falls back to the workspace's own rows when no default names a usable one.
 *
 * Exactly one eligible row is not a choice, so it is taken and reported. More
 * than one is a real decision about whose money goes where, and guessing at it
 * is the silent substitution this module exists to avoid -- so it asks, naming
 * the candidates. None leaves the original reasons to explain themselves.
 */
function lastResort(
  kind: "caption" | "slides",
  available: ModelRow[],
  reasons: string[],
): ModelChoice {
  const noun = kind === "caption" ? "caption" : "slide";
  const verb = kind === "caption" ? "write captions" : "render slides";
  const eligible = available.filter((r) => rejectionFor(r, kind) === null);

  if (eligible.length === 1) {
    const row = eligible[0];
    const why =
      `No default ${noun} model is set, so the only configured model that can ${verb} ` +
      `(${row.label}) was used.`;
    return chosenFrom(row, reasons.length ? `${reasons.join(" ")} ${why}` : why);
  }

  if (eligible.length > 1) {
    // Named by label *and* api model id. Labels are free text and nothing
    // stops two rows sharing one, so "(gpt, gpt)" is a real outcome -- and it
    // tells the reader nothing about which row to go and pick.
    throw new GenerationError(
      `No default ${noun} model is set and ${eligible.length} configured models could ${verb} ` +
        `(${eligible.map((r) => `${r.label} - ${r.apiModelId}`).join(", ")}). ` +
        `Set the ${noun} default in Accounts, or narrow one model's role.`,
    );
  }

  if (reasons.length) {
    throw new GenerationError(
      `No usable ${noun} model. ${reasons.join(" ")} ` +
        `Fix the model in Accounts, or pick a different default.`,
    );
  }

  throw new GenerationError(
    kind === "caption"
      ? "No caption model is configured. Add one in Accounts and set it as the default for captions."
      : "No slide model is configured. Add a model that can generate images in Accounts " +
        "and set it as the default for slides.",
  );
}

export function pickTextModel({
  goalModel,
  workspaceModel,
  available = [],
}: PickModelInput): ModelChoice {
  const named = [
    { row: goalModel, which: "The goal's model" },
    { row: workspaceModel, which: "The workspace default model" },
  ];

  const reasons: string[] = [];

  for (const [index, { row, which }] of named.entries()) {
    if (!row) continue;

    const why = rejectionFor(row, "caption");
    if (why) {
      reasons.push(`${which} (${row.label}) ${why}`);
      continue;
    }

    // Using the workspace default rather than the goal's own model is still
    // a substitution worth reporting.
    return chosenFrom(row, index === 0 ? null : reasons.join(" ") || null);
  }

  return lastResort("caption", available, reasons);
}

/**
 * Which model renders the slides.
 *
 * Images were pinned to a constant, so a workspace could configure a slide
 * model in Accounts and watch every run ignore it. Same contract as the
 * caption side now: the row decides, a row marked CAPTION cannot serve slides,
 * and nothing usable is an error rather than a quiet return to the built-in.
 */
export function pickImageModel({
  workspaceModel,
  available = [],
}: {
  workspaceModel: ModelRow | null;
  available?: ModelRow[];
}): ModelChoice {
  const reasons: string[] = [];

  if (workspaceModel) {
    const why = rejectionFor(workspaceModel, "slides");
    if (!why) return chosenFrom(workspaceModel, null);
    reasons.push(`The slide model (${workspaceModel.label}) ${why}`);
  }

  return lastResort("slides", available, reasons);
}
