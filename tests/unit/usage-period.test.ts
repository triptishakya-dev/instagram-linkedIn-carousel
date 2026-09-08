import { describe, expect, it } from "vitest";
import { usageAt, usageTokens } from "@/lib/reds/usage-period";
import type { Post } from "@/lib/reds/types";

const post = (over: Partial<Post> = {}): Post => ({
  id: "p1",
  goalId: "goal_1",
  generationRunId: "run_1",
  platforms: ["instagram"],
  slides: [],
  caption: "",
  hashtags: [],
  state: "draft",
  scheduledFor: null,
  publishedAt: null,
  usage: {
    inputTokens: 755,
    outputTokens: 157,
    estimatedCostInr: 91.2,
    generationMs: 1000,
    modelId: "m1",
    runs: 1,
  },
  versions: [],
  createdAt: "2026-09-08T07:29:20.069Z",
  updatedAt: "2026-09-08T07:35:24.584Z",
  ...over,
});

describe("usageAt", () => {
  /**
   * The bug this exists to prevent: usage was dated by `scheduledFor`, which
   * generation never sets, so every generated post was filtered out of the
   * usage page and the dashboard while the shell footer -- which applied no
   * date filter -- reported the true total. Same data, two answers.
   */
  it("dates an unscheduled generated post by when it was generated", () => {
    const p = post({ scheduledFor: null, createdAt: "2026-09-08T07:29:20.069Z" });

    expect(usageAt(p).toISOString()).toBe("2026-09-08T07:29:20.069Z");
  });

  it("ignores scheduledFor even when the post has one", () => {
    // A post generated in September and scheduled for November spent its
    // tokens in September; November is a publishing fact, not a spending one.
    const p = post({
      createdAt: "2026-09-08T07:29:20.069Z",
      scheduledFor: "2026-11-01T09:00:00.000Z",
    });

    expect(usageAt(p).getMonth()).toBe(8); // September
  });

  it("counts a post whose scheduledFor is null as in-period", () => {
    const p = post({ scheduledFor: null, createdAt: "2026-09-08T07:29:20.069Z" });
    const sameMonth = (d: Date) => d.getFullYear() === 2026 && d.getMonth() === 8;

    expect(sameMonth(usageAt(p))).toBe(true);
  });
});

describe("usageTokens", () => {
  it("sums input and output", () => {
    expect(usageTokens(post())).toBe(912);
  });

  it("is zero for a post that consumed nothing", () => {
    const p = post({
      usage: { inputTokens: 0, outputTokens: 0, estimatedCostInr: 0, generationMs: 0, modelId: "", runs: 0 },
    });

    expect(usageTokens(p)).toBe(0);
  });
});
