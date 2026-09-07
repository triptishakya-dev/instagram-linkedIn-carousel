/**
 * Chooses which model actually gets called, and records why.
 *
 * A goal names an `AiModel` row, but a row is not necessarily callable: it may
 * have no `apiModelId` yet, or name a model the proxy cannot serve because its
 * provider key is absent. Generation still has to produce something, so it
 * falls back — but a silent fallback is a lie by omission. The user configured
 * one model and got another, and the run has to say so.
 */

export type ModelRow = {
  id: string;
  label: string;
  apiModelId: string | null;
  enabled: boolean;
  inputPricePerMTokInr: number;
  outputPricePerMTokInr: number;
};

export type ModelChoice = {
  /** The `model_name` to send to the proxy. */
  apiModelId: string;
  /** The `AiModel` row this came from, or null when nothing configured matched. */
  modelRowId: string | null;
  rates: { inputPricePerMTokInr: number; outputPricePerMTokInr: number };
  /**
   * Set when the goal's own model was not used. Surfaced on the run so the
   * substitution is visible rather than inferred from odd output.
   */
  fallbackReason: string | null;
};

/** Used when nothing configured can answer. Overridable per environment. */
export function defaultTextModel(): string {
  return process.env.GENERATION_FALLBACK_MODEL ?? "gemini-flash-latest";
}

const ZERO_RATES = { inputPricePerMTokInr: 0, outputPricePerMTokInr: 0 };

function ratesOf(row: ModelRow) {
  return {
    inputPricePerMTokInr: row.inputPricePerMTokInr,
    outputPricePerMTokInr: row.outputPricePerMTokInr,
  };
}

export type PickModelInput = {
  /** The row the goal names, if it names one that still exists. */
  goalModel: ModelRow | null;
  /** Workspace default, from `settings.defCaptionModel`. */
  workspaceModel: ModelRow | null;
  /** `model_name`s the proxy advertises. Empty means "cannot check". */
  servable: string[];
};

export function pickTextModel({ goalModel, workspaceModel, servable }: PickModelInput): ModelChoice {
  // An empty list means the proxy could not be reached for a list, not that it
  // serves nothing. Treating it as "nothing is servable" would reject every
  // correctly configured model, so the check is skipped instead.
  const canServe = (name: string) => servable.length === 0 || servable.includes(name);

  const candidates: { row: ModelRow | null; whenRejected: (why: string) => string }[] = [
    {
      row: goalModel,
      whenRejected: (why) => why,
    },
    {
      row: workspaceModel,
      whenRejected: (why) => why,
    },
  ];

  const reasons: string[] = [];

  for (const [index, candidate] of candidates.entries()) {
    const row = candidate.row;
    const which = index === 0 ? "The goal's model" : "The workspace default model";
    if (!row) continue;

    if (!row.enabled) {
      reasons.push(`${which} (${row.label}) is disabled.`);
      continue;
    }
    if (!row.apiModelId) {
      reasons.push(`${which} (${row.label}) has no API model id set.`);
      continue;
    }
    if (!canServe(row.apiModelId)) {
      reasons.push(`${which} (${row.label}) asks for "${row.apiModelId}", which the proxy does not serve.`);
      continue;
    }

    return {
      apiModelId: row.apiModelId,
      modelRowId: row.id,
      rates: ratesOf(row),
      // Using the workspace default rather than the goal's own model is still
      // a substitution worth reporting.
      fallbackReason: index === 0 ? null : reasons.join(" ") || null,
    };
  }

  const fallback = defaultTextModel();
  reasons.push(`Fell back to "${fallback}".`);

  return {
    apiModelId: fallback,
    modelRowId: null,
    // No configured row means no configured pricing; reporting zero cost is
    // honest, whereas guessing a rate would put invented money on screen.
    rates: ZERO_RATES,
    fallbackReason: reasons.join(" "),
  };
}
