import { describe, expect, it } from "vitest";
import {
  GENERATION_DEFAULTS,
  normaliseSlideCount,
  parseInfographicDetails,
  parseRecentTopics,
  resolveGeneration,
  type GoalConfig,
} from "@/lib/generation/resolve-prompt";

/** A goal that configures nothing, so each test opts into one field. */
const bareGoal: GoalConfig = {
  id: "gol_1",
  name: "Interior renovation photography",
  imagePrompt: null,
  captionPrompt: null,
  visualStyle: null,
  slideCount: null,
  infographicDetails: null,
  recentTopics: [],
  brandLogoAssetId: null,
  referenceAssetIds: [],
  imageAssetIds: [],
  modelId: null,
};

const goal = (over: Partial<GoalConfig> = {}): GoalConfig => ({ ...bareGoal, ...over });

describe("resolveGeneration — three-tier resolution", () => {
  it("prefers the goal's own image prompt", () => {
    const r = resolveGeneration(
      goal({ imagePrompt: "Before-and-after kitchen renovations" }),
      { imagePrompt: "workspace-level fallback" },
      "INSTAGRAM",
    );
    expect(r.topicSeed).toBe("Before-and-after kitchen renovations");
  });

  it("falls back to workspace settings, then to the goal name", () => {
    expect(resolveGeneration(goal(), { imagePrompt: "workspace wording" }, "INSTAGRAM").topicSeed).toBe(
      "workspace wording",
    );
    expect(resolveGeneration(goal(), {}, "INSTAGRAM").topicSeed).toBe("Interior renovation photography");
  });

  // Whitespace-only is the shape an emptied textarea actually saves as, and it
  // would otherwise win over a perfectly good workspace default.
  it("treats a blank or whitespace-only prompt as unset", () => {
    const r = resolveGeneration(goal({ imagePrompt: "   " }), { imagePrompt: "workspace wording" }, "INSTAGRAM");
    expect(r.topicSeed).toBe("workspace wording");
  });

  it("resolves the caption seed independently, ending at the topic seed", () => {
    expect(
      resolveGeneration(goal({ captionPrompt: "Warm, practical, no hype" }), {}, "INSTAGRAM").captionSeed,
    ).toBe("Warm, practical, no hype");
    expect(resolveGeneration(goal({ imagePrompt: "kitchens" }), {}, "INSTAGRAM").captionSeed).toBe("kitchens");
  });
});

describe("resolveGeneration — prompt mode", () => {
  // Choosing a style is what opts into having the prompt composed. A goal
  // whose prompt already dictates its own lens, lighting and framing must not
  // have a style preset's directives prepended to it.
  it("uses the prompt verbatim when no style is chosen anywhere", () => {
    const r = resolveGeneration(goal({ imagePrompt: "A 50/50 before-and-after, 24mm, no text" }), {}, "INSTAGRAM");
    expect(r.promptMode).toBe("verbatim");
  });

  it("composes when the goal names a style", () => {
    expect(resolveGeneration(goal({ visualStyle: "isometric" }), {}, "INSTAGRAM").promptMode).toBe("composed");
  });

  it("composes when only the workspace names a style", () => {
    expect(resolveGeneration(goal(), { defaultVisualStyle: "editorial" }, "INSTAGRAM").promptMode).toBe(
      "composed",
    );
  });

  // An unrecognised stored value is not a choice, so it must not silently
  // switch the goal into composed mode with the default style.
  it("stays verbatim when the stored style is not a real preset", () => {
    expect(resolveGeneration(goal({ visualStyle: "vaporwave" }), {}, "INSTAGRAM").promptMode).toBe("verbatim");
  });

  it("never uses the diagram builder in verbatim mode, even with details", () => {
    const r = resolveGeneration(
      goal({ infographicDetails: { flowchartNodes: ["A", "B"] } }),
      {},
      "LINKEDIN",
    );
    expect(r.promptMode).toBe("verbatim");
    expect(r.useDiagramBuilder).toBe(false);
  });
});

describe("resolveGeneration — style", () => {
  it("takes the goal's style, then the workspace default, then 3d-render", () => {
    expect(resolveGeneration(goal({ visualStyle: "isometric" }), {}, "INSTAGRAM").style).toBe("isometric");
    expect(resolveGeneration(goal(), { defaultVisualStyle: "editorial" }, "INSTAGRAM").style).toBe("editorial");
    expect(resolveGeneration(goal(), {}, "INSTAGRAM").style).toBe(GENERATION_DEFAULTS.style);
  });

  // visualStyle is a plain column, so nothing at the database level stops a
  // stale or hand-edited value from reaching this.
  it("ignores a style that is not a real preset", () => {
    expect(resolveGeneration(goal({ visualStyle: "vaporwave" }), {}, "INSTAGRAM").style).toBe(
      GENERATION_DEFAULTS.style,
    );
  });
});

describe("resolveGeneration — per-platform framing", () => {
  it("reads the ratio for the platform being generated", () => {
    const settings = { igRatio: "1:1", liRatio: "16:9" };
    expect(resolveGeneration(goal(), settings, "INSTAGRAM").aspectRatio).toBe("1:1");
    expect(resolveGeneration(goal(), settings, "LINKEDIN").aspectRatio).toBe("16:9");
  });

  it("falls back per platform when settings are absent or nonsense", () => {
    expect(resolveGeneration(goal(), {}, "INSTAGRAM").aspectRatio).toBe("4:5");
    expect(resolveGeneration(goal(), {}, "LINKEDIN").aspectRatio).toBe("1.91:1");
    expect(resolveGeneration(goal(), { igRatio: "3:2" }, "INSTAGRAM").aspectRatio).toBe("4:5");
  });

  it("lets the goal's slide count override the platform default", () => {
    const settings = { igSlides: 8, liSlides: 6 };
    expect(resolveGeneration(goal(), settings, "INSTAGRAM").slideCount).toBe(8);
    expect(resolveGeneration(goal(), settings, "LINKEDIN").slideCount).toBe(6);
    expect(resolveGeneration(goal({ slideCount: 3 }), settings, "INSTAGRAM").slideCount).toBe(3);
  });
});

describe("resolveGeneration — diagram eligibility", () => {
  const nodes = { flowchartNodes: ["Request", "Worker", "S3"] };

  it("routes to the diagram builder only with a diagram style and drawable detail", () => {
    expect(
      resolveGeneration(goal({ visualStyle: "tech-infographic", infographicDetails: nodes }), {}, "LINKEDIN")
        .useDiagramBuilder,
    ).toBe(true);
    expect(
      resolveGeneration(goal({ visualStyle: "architecture-diagram", infographicDetails: nodes }), {}, "LINKEDIN")
        .useDiagramBuilder,
    ).toBe(true);
  });

  // The regression that motivated all of this: an infographic style with
  // nothing to draw used to inherit a Redis request-lifecycle diagram.
  it("refuses the diagram path when the goal supplied no structure", () => {
    const r = resolveGeneration(goal({ visualStyle: "tech-infographic" }), {}, "LINKEDIN");
    expect(r.useDiagramBuilder).toBe(false);
    expect(r.infographicDetails).toBeNull();
  });

  it("does not count a title or quote alone as drawable structure", () => {
    const r = resolveGeneration(
      goal({
        visualStyle: "tech-infographic",
        infographicDetails: { headerTitle: "Our stack", takeawayQuote: "Ship it" },
      }),
      {},
      "LINKEDIN",
    );
    expect(r.useDiagramBuilder).toBe(false);
    // The details still survive for the header; they are just not a diagram.
    expect(r.infographicDetails).toEqual({ headerTitle: "Our stack", takeawayQuote: "Ship it" });
  });

  it("never uses the diagram builder for a pictorial style, even with details", () => {
    expect(
      resolveGeneration(goal({ visualStyle: "photorealistic", infographicDetails: nodes }), {}, "INSTAGRAM")
        .useDiagramBuilder,
    ).toBe(false);
  });
});

describe("parseInfographicDetails", () => {
  it("keeps only usable fields and drops empty ones", () => {
    const parsed = parseInfographicDetails({
      headerTitle: "Pipeline",
      subtitle: "   ",
      flowchartNodes: ["A", "", "  ", "B"],
      timelineSteps: [],
      badges: ["Fast"],
      metricsText: null,
    });
    expect(parsed).toEqual({ headerTitle: "Pipeline", flowchartNodes: ["A", "B"], badges: ["Fast"] });
  });

  it("returns null for anything with nothing usable in it", () => {
    expect(parseInfographicDetails(null)).toBeNull();
    expect(parseInfographicDetails({})).toBeNull();
    expect(parseInfographicDetails({ subtitle: "  ", flowchartNodes: [] })).toBeNull();
    expect(parseInfographicDetails("flowchart")).toBeNull();
    expect(parseInfographicDetails(["A", "B"])).toBeNull();
  });
});

describe("parseRecentTopics", () => {
  it("keeps the newest topics within the window", () => {
    const topics = Array.from({ length: 14 }, (_, i) => `topic ${i + 1}`);
    const kept = parseRecentTopics(topics, 10);
    expect(kept).toHaveLength(10);
    expect(kept[0]).toBe("topic 5");
    expect(kept.at(-1)).toBe("topic 14");
  });

  it("survives a column that is null, absent or the wrong shape", () => {
    expect(parseRecentTopics(null)).toEqual([]);
    expect(parseRecentTopics({ nope: 1 })).toEqual([]);
    expect(parseRecentTopics([1, 2, 3])).toEqual([]);
  });
});

describe("normaliseSlideCount", () => {
  // A stored 0 would render an empty post; >10 is rejected by Instagram.
  it("clamps to a publishable range", () => {
    expect(normaliseSlideCount(0)).toBe(1);
    expect(normaliseSlideCount(-4)).toBe(1);
    expect(normaliseSlideCount(1)).toBe(1);
    expect(normaliseSlideCount(10)).toBe(10);
    expect(normaliseSlideCount(25)).toBe(10);
  });

  it("handles fractional and non-finite values", () => {
    expect(normaliseSlideCount(3.7)).toBe(3);
    expect(normaliseSlideCount(Number.NaN)).toBe(1);
    expect(normaliseSlideCount(Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe("resolveGeneration — assets and model pass through", () => {
  it("carries the goal's assets and model id", () => {
    const r = resolveGeneration(
      goal({
        brandLogoAssetId: "ast_logo",
        referenceAssetIds: ["ast_1", "ast_2"],
        imageAssetIds: ["ast_3"],
        modelId: "mdl_1",
      }),
      {},
      "INSTAGRAM",
    );
    expect(r.brandLogoAssetId).toBe("ast_logo");
    expect(r.referenceAssetIds).toEqual(["ast_1", "ast_2"]);
    expect(r.imageAssetIds).toEqual(["ast_3"]);
    expect(r.modelId).toBe("mdl_1");
  });

  it("normalises an empty model or logo id to null", () => {
    const r = resolveGeneration(goal({ modelId: "", brandLogoAssetId: "" }), {}, "INSTAGRAM");
    expect(r.modelId).toBeNull();
    expect(r.brandLogoAssetId).toBeNull();
  });
});
