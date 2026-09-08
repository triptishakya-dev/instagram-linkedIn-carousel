import { describe, expect, it } from "vitest";
import { runSiblings } from "@/lib/reds/run-siblings";
import type { Platform, Post } from "@/lib/reds/types";

const post = (over: Partial<Post> & { id: string; platforms: Platform[] }): Post => ({
  goalId: "goal_1",
  generationRunId: "run_1",
  slides: [],
  caption: "",
  hashtags: [],
  state: "draft",
  scheduledFor: null,
  publishedAt: null,
  usage: {
    inputTokens: 0,
    outputTokens: 0,
    estimatedCostInr: 0,
    generationMs: 0,
    modelId: "",
    runs: 0,
  },
  versions: [],
  createdAt: "2026-09-08T07:29:20.069Z",
  updatedAt: "2026-09-08T07:35:24.584Z",
  ...over,
});

describe("runSiblings", () => {
  it("pairs the two posts one run produced", () => {
    const ig = post({ id: "ig", platforms: ["instagram"] });
    const li = post({ id: "li", platforms: ["linkedin"] });

    const found = runSiblings(ig, [ig, li]);

    expect(found.instagram?.id).toBe("ig");
    expect(found.linkedin?.id).toBe("li");
  });

  it("pairs identically when viewed from the other side", () => {
    const ig = post({ id: "ig", platforms: ["instagram"] });
    const li = post({ id: "li", platforms: ["linkedin"] });

    expect(runSiblings(li, [ig, li])).toEqual(runSiblings(ig, [ig, li]));
  });

  /**
   * This is what puts the empty state on screen: the platform key is absent,
   * so the card renders "No LinkedIn content generated yet." rather than
   * implying the run covered a platform it never touched.
   */
  it("leaves a platform absent when the run produced nothing for it", () => {
    const ig = post({ id: "ig", platforms: ["instagram"] });

    const found = runSiblings(ig, [ig]);

    expect(found.instagram?.id).toBe("ig");
    expect(found.linkedin).toBeUndefined();
    expect("linkedin" in found).toBe(false);
  });

  it("ignores posts from other runs", () => {
    const ig = post({ id: "ig", platforms: ["instagram"] });
    const other = post({ id: "other", platforms: ["linkedin"], generationRunId: "run_2" });

    expect(runSiblings(ig, [ig, other]).linkedin).toBeUndefined();
  });

  // Two hand-composed posts share a null run id; grouping on it would collect
  // every unrelated draft in the workspace into one card pair.
  it("does not group hand-composed posts by their missing run id", () => {
    const a = post({ id: "a", platforms: ["instagram"], generationRunId: null });
    const b = post({ id: "b", platforms: ["linkedin"], generationRunId: null });

    const found = runSiblings(a, [a, b]);

    expect(found.instagram?.id).toBe("a");
    expect(found.linkedin).toBeUndefined();
  });

  it("keeps the viewed post in its own slot when another row claims the platform", () => {
    const first = post({ id: "first", platforms: ["instagram"] });
    const viewed = post({ id: "viewed", platforms: ["instagram"] });

    expect(runSiblings(viewed, [first, viewed]).instagram?.id).toBe("viewed");
  });

  it("covers a post that names both platforms itself", () => {
    const both = post({ id: "both", platforms: ["instagram", "linkedin"] });

    const found = runSiblings(both, [both]);

    expect(found.instagram?.id).toBe("both");
    expect(found.linkedin?.id).toBe("both");
  });
});
