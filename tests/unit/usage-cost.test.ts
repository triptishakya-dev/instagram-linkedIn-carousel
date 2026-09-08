import { describe, expect, it } from "vitest";
import { captionCostInr, imageCostInr, sumCostInr } from "@/lib/usage/cost";

const rates = { inputPricePerMTokInr: 268, outputPricePerMTokInr: 1340 };

describe("captionCostInr", () => {
  it("prices a call from the row's own rates", () => {
    expect(captionCostInr({ inputTokens: 1_000_000, outputTokens: 500_000 }, rates)).toBe(938);
  });

  it("rounds to paise so currency does not render a float tail", () => {
    expect(captionCostInr({ inputTokens: 1234, outputTokens: 567 }, rates)).toBe(1.09);
  });

  it("reproduces the figure the live post carries", () => {
    // The Instagram post's recorded 755 in / 157 out at the workspace's own
    // ₹100,000 per Mtok on both sides.
    const cost = captionCostInr(
      { inputTokens: 755, outputTokens: 157 },
      { inputPricePerMTokInr: 100_000, outputPricePerMTokInr: 100_000 },
    );
    expect(cost).toBe(91.2);
  });

  it("is zero for a real call that used no tokens", () => {
    expect(captionCostInr({ inputTokens: 0, outputTokens: 0 }, rates)).toBe(0);
  });

  /**
   * The distinction the whole module turns on: a provider that reported no
   * usage tells us nothing about cost, and answering 0 would state that the
   * call was free.
   */
  it("is null when the provider reported no usage at all", () => {
    expect(captionCostInr({ inputTokens: null, outputTokens: null }, rates)).toBeNull();
  });

  it("still prices a half-reported call", () => {
    expect(captionCostInr({ inputTokens: 1_000_000, outputTokens: null }, rates)).toBe(268);
  });

  it("is zero when the rates are zero, not null", () => {
    expect(
      captionCostInr({ inputTokens: 5000, outputTokens: 5000 }, { inputPricePerMTokInr: 0, outputPricePerMTokInr: 0 }),
    ).toBe(0);
  });
});

describe("imageCostInr", () => {
  it("prices per image", () => {
    expect(imageCostInr(1, 8.5)).toBe(8.5);
    expect(imageCostInr(8, 8.5)).toBe(68);
  });

  /**
   * gpt-image and Gemini bill images as input and output tokens and return the
   * counts. Refusing to apply the row's rates to them -- the original rule
   * here -- left the entire image bill null even with rates configured.
   */
  it("prices a token-billed image from the provider's own counts", () => {
    const cost = imageCostInr(
      1,
      null,
      { inputTokens: 654, outputTokens: 1372 },
      { inputPricePerMTokInr: 37.8, outputPricePerMTokInr: 151.81 },
    );
    expect(cost).toBe(0.23);
  });

  it("prefers a flat per-image rate over token rates when both are set", () => {
    const cost = imageCostInr(
      1,
      8.5,
      { inputTokens: 654, outputTokens: 1372 },
      { inputPricePerMTokInr: 37.8, outputPricePerMTokInr: 151.81 },
    );
    expect(cost).toBe(8.5);
  });

  it("is null when neither a per-image rate nor provider tokens exist", () => {
    expect(imageCostInr(1, null)).toBeNull();
    expect(imageCostInr(1, null, { inputTokens: null, outputTokens: null }, { inputPricePerMTokInr: 1, outputPricePerMTokInr: 1 })).toBeNull();
  });

  it("is null when the provider reported tokens but the row has no rates", () => {
    expect(imageCostInr(1, null, { inputTokens: 654, outputTokens: 1372 })).toBeNull();
  });

  it("is zero for a priced model that produced no image", () => {
    expect(imageCostInr(0, 8.5)).toBe(0);
  });

  it("rounds to paise", () => {
    expect(imageCostInr(3, 1.111)).toBe(3.33);
  });

  // Half-paise cases land wherever binary float puts them -- 3 x 1.005 is
  // 3.0149999... and rounds down. Same behaviour as the token pricing this
  // sits beside, so the two never disagree on a shared total.
  it("follows float rounding on a half-paise boundary", () => {
    expect(imageCostInr(3, 1.005)).toBe(3.01);
  });
});

describe("sumCostInr", () => {
  it("adds the known values", () => {
    expect(sumCostInr([91.2, 8.5, 8.5])).toBe(108.2);
  });

  // A post whose caption is priced and whose images are not reports the
  // caption's cost, with the unpriced images surfaced separately.
  it("reports the known part of a partly unpriced set", () => {
    expect(sumCostInr([91.2, null, null])).toBe(91.2);
  });

  it("is null when nothing in the set is priced", () => {
    expect(sumCostInr([null, null])).toBeNull();
    expect(sumCostInr([])).toBeNull();
  });

  it("is zero when every value is a real zero", () => {
    expect(sumCostInr([0, 0])).toBe(0);
  });
});
