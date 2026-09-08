/**
 * What one provider call cost, in rupees.
 *
 * Pure and provider-agnostic on purpose: the three call sites report what the
 * provider actually returned, and pricing is decided here from the `AiModel`
 * row's own rates. Before this existed the caption path priced itself inline
 * and the two image paths priced nothing at all, so a carousel's entire image
 * bill was invisible.
 *
 * Null is a real answer everywhere in this module. "We do not know what this
 * cost" and "this cost nothing" are different facts, and collapsing the first
 * into the second is what made eight generated images read as free.
 */

export type TokenRates = {
  inputPricePerMTokInr: number;
  outputPricePerMTokInr: number;
};

/** Usage as the provider reported it. Null where it reported nothing. */
export type TokenUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
};

/** Rounded to paise, because this is rendered as currency. */
function toPaise(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Token-billed cost, for caption calls.
 *
 * Returns null when the provider reported no usage at all -- a failed call
 * that never reached the model, typically. A call that reports zero tokens
 * genuinely cost zero and returns 0.
 */
export function captionCostInr(usage: TokenUsage, rates: TokenRates): number | null {
  if (usage.inputTokens == null && usage.outputTokens == null) return null;

  const input = ((usage.inputTokens ?? 0) / 1_000_000) * rates.inputPricePerMTokInr;
  const output = ((usage.outputTokens ?? 0) / 1_000_000) * rates.outputPricePerMTokInr;
  return toPaise(input + output);
}

/**
 * What an image call cost, on whichever basis the provider actually billed.
 *
 * Two real billing models, so two branches rather than one assumption:
 *
 *   per image  -- a flat rate per generated image (`imagePriceInr`)
 *   per token  -- gpt-image and Gemini bill the prompt and the image itself as
 *                 input and output tokens, and return the counts to prove it
 *
 * An earlier version refused the token branch outright, on the reasoning that
 * an image model's per-token rates are meaningless. That is true of a flat
 * per-image provider and false of gpt-image, which is exactly what this
 * workspace runs -- so the whole image bill stayed null even once the rates
 * were filled in.
 *
 * Neither branch invents anything: the token counts come from the provider's
 * own response and the rates from the model row. Unpriced still returns null.
 */
export function imageCostInr(
  imageCount: number,
  imagePriceInr: number | null | undefined,
  tokens?: TokenUsage,
  rates?: TokenRates,
): number | null {
  // A flat per-image rate is the more specific statement of intent, so it wins
  // where the operator has set one.
  if (imagePriceInr != null) {
    return imageCount <= 0 ? 0 : toPaise(imageCount * imagePriceInr);
  }

  // Otherwise price it like any other token-billed call, when the provider
  // reported usage and the row carries rates to apply to it.
  if (tokens && rates && (tokens.inputTokens != null || tokens.outputTokens != null)) {
    return captionCostInr(tokens, rates);
  }

  return null;
}

/**
 * Adds costs where at least one is known.
 *
 * Summing a list that is entirely unknown gives null, not zero: a total of
 * "nothing priced yet" must not render as ₹0. A mix reports the known part,
 * which is why the UI shows the unpriced count alongside any total.
 */
export function sumCostInr(values: readonly (number | null | undefined)[]): number | null {
  const known = values.filter((v): v is number => typeof v === "number");
  if (known.length === 0) return null;
  return toPaise(known.reduce((a, b) => a + b, 0));
}
