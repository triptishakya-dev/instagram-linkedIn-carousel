import { describe, expect, it } from "vitest";
import { aggregateUsage, type UsageRow } from "@/lib/usage/aggregate";

const row = (over: Partial<UsageRow> = {}): UsageRow => ({
  kind: "CAPTION",
  status: "OK",
  apiModelId: "gpt-4.1-mini",
  provider: "OpenAI",
  goalId: "goal_1",
  postId: "post_1",
  modelId: "model_1",
  inputTokens: 755,
  outputTokens: 157,
  imageCount: null,
  costInr: 91.2,
  latencyMs: 3800,
  isBackfilled: false,
  createdAt: new Date("2026-09-08T07:29:20.069Z"),
  ...over,
});

const image = (over: Partial<UsageRow> = {}): UsageRow =>
  row({
    kind: "IMAGE",
    apiModelId: "gpt-image-2",
    inputTokens: 654,
    outputTokens: 1372,
    imageCount: 1,
    // No `imagePriceInr` configured, so the call is unpriced -- not free.
    costInr: null,
    ...over,
  });

describe("aggregateUsage", () => {
  it("reports zeroes and a null cost for no events", () => {
    const a = aggregateUsage([]);

    expect(a.totals.calls).toBe(0);
    expect(a.totals.tokens).toBe(0);
    expect(a.totals.costInr).toBeNull();
    expect(a.byModel).toEqual([]);
    expect(a.byDay).toEqual([]);
  });

  it("sums one successful call", () => {
    const a = aggregateUsage([row()]);

    expect(a.totals).toMatchObject({ calls: 1, ok: 1, failed: 0, tokens: 912, costInr: 91.2 });
  });

  it("splits caption and image", () => {
    const a = aggregateUsage([row(), image(), image()]);

    expect(a.byKind.caption.calls).toBe(1);
    expect(a.byKind.image.calls).toBe(2);
    expect(a.byKind.image.images).toBe(2);
    // Image tokens are real usage and still counted, even though they do not
    // price the call.
    expect(a.byKind.image.tokens).toBe((654 + 1372) * 2);
  });

  /**
   * The distinction the ledger exists to preserve. Two unpriced image calls
   * must not drag the total to look complete, and must not read as ₹0 either.
   */
  it("reports the priced part and counts what is unpriced", () => {
    const a = aggregateUsage([row(), image(), image()]);

    expect(a.totals.costInr).toBe(91.2);
    expect(a.totals.unpricedCalls).toBe(2);
    expect(a.byKind.image.costInr).toBeNull();
    expect(a.byKind.image.unpricedCalls).toBe(2);
  });

  it("counts failed calls without inventing usage for them", () => {
    const failed = row({ status: "FAILED", inputTokens: null, outputTokens: null, costInr: null });
    const a = aggregateUsage([row(), failed]);

    expect(a.totals).toMatchObject({ calls: 2, ok: 1, failed: 1 });
    expect(a.totals.tokens).toBe(912);
    expect(a.totals.costInr).toBe(91.2);
  });

  it("groups by model, most spend first", () => {
    const a = aggregateUsage([
      row({ apiModelId: "cheap", costInr: 1 }),
      row({ apiModelId: "dear", costInr: 100 }),
      row({ apiModelId: "dear", costInr: 50 }),
    ]);

    expect(a.byModel.map((m) => m.key)).toEqual(["dear", "cheap"]);
    expect(a.byModel[0]).toMatchObject({ calls: 2, costInr: 150 });
  });

  it("groups by goal and resolves the goal's name", () => {
    const a = aggregateUsage(
      [row({ goalId: "g1" }), row({ goalId: "g2", costInr: 5 })],
      { goal: { g1: "Interior renovation photograph" } },
    );

    expect(a.byGoal[0]).toMatchObject({ key: "g1", label: "Interior renovation photograph" });
    // No label for g2, so its id stands in rather than showing "undefined".
    expect(a.byGoal[1]).toMatchObject({ key: "g2", label: "g2" });
  });

  it("skips rows with no goal rather than bucketing them under null", () => {
    const a = aggregateUsage([row({ goalId: null }), row({ goalId: "g1" })]);

    expect(a.byGoal).toHaveLength(1);
    expect(a.byGoal[0].key).toBe("g1");
  });

  it("groups by provider", () => {
    const a = aggregateUsage([row({ provider: "OpenAI" }), row({ provider: "Google", costInr: 2 })]);

    expect(a.byProvider.map((p) => p.key)).toEqual(["OpenAI", "Google"]);
  });

  describe("byDay", () => {
    it("buckets by UTC day, in order", () => {
      const a = aggregateUsage([
        row({ createdAt: new Date("2026-09-09T05:00:00.000Z"), costInr: 2 }),
        row({ createdAt: new Date("2026-09-08T07:00:00.000Z"), costInr: 1 }),
        row({ createdAt: new Date("2026-09-08T23:00:00.000Z"), costInr: 3 }),
      ]);

      expect(a.byDay.map((d) => d.day)).toEqual(["2026-09-08", "2026-09-09"]);
      expect(a.byDay[0]).toMatchObject({ calls: 2, costInr: 4 });
    });

    // A bucket key that shifted with the reader's timezone would move spend
    // between days depending on who was looking.
    it("keeps midnight boundaries in UTC", () => {
      const a = aggregateUsage([
        row({ createdAt: new Date("2026-09-08T23:59:59.999Z") }),
        row({ createdAt: new Date("2026-09-09T00:00:00.000Z") }),
      ]);

      expect(a.byDay.map((d) => d.day)).toEqual(["2026-09-08", "2026-09-09"]);
      expect(a.byDay.every((d) => d.calls === 1)).toBe(true);
    });
  });

  it("counts backfilled rows separately so a total is never mistaken for measured", () => {
    const a = aggregateUsage([row(), row({ isBackfilled: true })]);

    expect(a.totals.calls).toBe(2);
    expect(a.totals.backfilledCalls).toBe(1);
  });

  it("reproduces the figures the live ledger holds", () => {
    // Two captions and two images from one real run: 2,819 in / 3,432 out,
    // ₹181.50 priced, two image calls unpriced.
    const a = aggregateUsage([
      row({ inputTokens: 755, outputTokens: 145, costInr: 90 }),
      row({ inputTokens: 756, outputTokens: 159, costInr: 91.5 }),
      image({ inputTokens: 654, outputTokens: 1372 }),
      image({ inputTokens: 654, outputTokens: 1756 }),
    ]);

    expect(a.totals.inputTokens).toBe(2819);
    expect(a.totals.outputTokens).toBe(3432);
    expect(a.totals.tokens).toBe(6251);
    expect(a.totals.costInr).toBe(181.5);
    expect(a.totals.unpricedCalls).toBe(2);
    expect(a.totals.images).toBe(2);
  });
});
