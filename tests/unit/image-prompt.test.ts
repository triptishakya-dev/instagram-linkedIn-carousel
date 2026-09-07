import { describe, expect, it } from "vitest";
import {
  DIAGRAM_STYLES,
  VISUAL_STYLES,
  buildCarouselPrompts,
  buildImagePrompt,
  buildTechInfographicPrompt,
  isVisualStyle,
} from "@/prompt/image-generator";

/**
 * Content that used to be baked into the prompt builder as default parameter
 * values and inline fallbacks. Any of these words appearing in a prompt for an
 * unrelated goal means the builder is describing somebody else's diagram.
 */
const FABRICATED = [
  "Redis",
  "Load Balancer",
  "Database Cluster",
  "Cache Hit",
  "Request Lifecycle",
  "Backend Components",
  "Fast Response",
  "Production Ready",
  "modern backend application",
];

function expectNoFabrication(prompt: string) {
  for (const phrase of FABRICATED) {
    expect(prompt, `prompt should not mention "${phrase}"`).not.toContain(phrase);
  }
}

describe("buildImagePrompt — no fabricated diagram content", () => {
  // The exact regression: a goal about anything at all, on a diagram style,
  // with no details of its own, used to inherit a Redis request-lifecycle
  // diagram — flowchart, timeline, latency metrics and a database quote.
  it.each(DIAGRAM_STYLES)("invents nothing for %s when the goal supplied no details", (style) => {
    const { prompt } = buildImagePrompt({
      topic: "Before-and-after kitchen renovations",
      style,
      platform: "INSTAGRAM",
    });

    expect(prompt).toContain("Before-and-after kitchen renovations");
    expectNoFabrication(prompt);
  });

  it("omits each section the goal did not supply", () => {
    const { prompt } = buildImagePrompt({
      topic: "Kitchen renovations",
      style: "tech-infographic",
      platform: "INSTAGRAM",
    });

    expect(prompt).not.toContain("Central Flowchart Diagram");
    expect(prompt).not.toContain("Lower Section Timeline");
    expect(prompt).not.toContain("Metrics Stat Box");
    expect(prompt).not.toContain("Takeaway Banner");
    expect(prompt).not.toContain("Footer Status Badges");
    // The header still renders: a title is always derivable from the topic.
    expect(prompt).toContain("Header Section");
  });

  it("describes the goal's own nodes, in the diagram and in the legend", () => {
    const { prompt } = buildImagePrompt({
      topic: "How our generation pipeline works",
      style: "architecture-diagram",
      platform: "LINKEDIN",
      infographicDetails: {
        flowchartNodes: ["Goal row", "Temporal worker", "LiteLLM", "S3"],
      },
    });

    expect(prompt).toContain("Goal row -> Temporal worker -> LiteLLM -> S3");
    // The side panel names the caller's nodes; it used to list a fixed
    // backend stack on every infographic regardless of subject.
    expect(prompt).toContain("'Components' legend listing Goal row, Temporal worker, LiteLLM, S3");
    expectNoFabrication(prompt);
  });

  it("numbers the timeline to the steps actually given, not always eight", () => {
    const { prompt } = buildImagePrompt({
      topic: "Three-step onboarding",
      style: "tech-infographic",
      platform: "LINKEDIN",
      infographicDetails: { timelineSteps: ["Sign up", "Connect account", "First post"] },
    });

    expect(prompt).toContain("numbered steps 1 through 3");
    expect(prompt).toContain("Sign up | Connect account | First post");
    expect(prompt).not.toContain("1 through 8");
  });

  it("renders badges only when the goal named them", () => {
    const without = buildImagePrompt({
      topic: "Pipeline",
      style: "tech-infographic",
      infographicDetails: { metricsText: "p95 under 200ms" },
    });
    expect(without.prompt).not.toContain("Footer Status Badges");

    const withBadges = buildImagePrompt({
      topic: "Pipeline",
      style: "tech-infographic",
      infographicDetails: { metricsText: "p95 under 200ms", badges: ["Durable", "Idempotent"] },
    });
    expect(withBadges.prompt).toContain("[Durable], [Idempotent]");
  });

  it("keeps the subtitle clause out when there is no subtitle", () => {
    const { prompt } = buildImagePrompt({
      topic: "Kitchens",
      style: "tech-infographic",
      infographicDetails: { headerTitle: "Kitchen flow", flowchartNodes: ["Brief", "Build"] },
    });
    expect(prompt).toContain('titled "Kitchen flow"');
    expect(prompt).not.toContain("with subtitle");
  });
});

describe("buildTechInfographicPrompt — content has no defaults", () => {
  it("fabricates nothing from a title alone", () => {
    const { prompt } = buildTechInfographicPrompt({ title: "How we photograph interiors" });

    expect(prompt).toContain("How we photograph interiors");
    expectNoFabrication(prompt);
  });

  it("passes the caller's own structure through", () => {
    const { prompt, aspectRatio } = buildTechInfographicPrompt({
      title: "Publish path",
      subtitle: "From draft to live",
      flowchartNodes: ["Draft", "Review", "Publish"],
      metricsText: "Median approval: 4 minutes",
      takeawayQuote: "Review is the bottleneck, not rendering.",
      badges: ["Audited"],
      platform: "LINKEDIN",
    });

    expect(prompt).toContain("Draft -> Review -> Publish");
    expect(prompt).toContain("From draft to live");
    expect(prompt).toContain("Median approval: 4 minutes");
    expect(prompt).toContain("Review is the bottleneck, not rendering.");
    expect(prompt).toContain("[Audited]");
    expect(aspectRatio).toBe("1.91:1");
    expectNoFabrication(prompt);
  });

  it("still frames per platform without inventing content", () => {
    expect(buildTechInfographicPrompt({ title: "X", platform: "INSTAGRAM" }).aspectRatio).toBe("4:5");
    expect(buildTechInfographicPrompt({ title: "X", platform: "LINKEDIN" }).aspectRatio).toBe("1.91:1");
  });
});

describe("buildCarouselPrompts — derived from the topic", () => {
  it("gives every slide the goal's topic and a distinct role", () => {
    const slides = buildCarouselPrompts("Restoring a 1920s staircase", 4, "editorial", "INSTAGRAM");

    expect(slides).toHaveLength(4);
    for (const s of slides) {
      expect(s.prompt).toContain("Restoring a 1920s staircase");
      expectNoFabrication(s.prompt);
    }
    // Distinct prompts, so a carousel is not four copies of one image.
    expect(new Set(slides.map((s) => s.prompt)).size).toBe(4);
  });

  it("honours an explicit aspect ratio over the platform default", () => {
    const platformDefault = buildCarouselPrompts("Staircases", 2, "editorial", "LINKEDIN");
    expect(platformDefault.every((s) => s.aspectRatio === "1.91:1")).toBe(true);

    // A workspace configured for square LinkedIn posts must win; the builder
    // used to substitute its own framing and silently ignore the setting.
    const configured = buildCarouselPrompts("Staircases", 2, "editorial", "LINKEDIN", "1:1");
    expect(configured.every((s) => s.aspectRatio === "1:1")).toBe(true);
  });
});

describe("style registry", () => {
  it("exposes every preset at runtime", () => {
    expect(VISUAL_STYLES).toHaveLength(11);
    expect(VISUAL_STYLES).toContain("3d-render");
    expect(VISUAL_STYLES).toContain("architecture-diagram");
  });

  it("recognises real styles and rejects everything else", () => {
    expect(isVisualStyle("glassmorphism")).toBe(true);
    expect(isVisualStyle("vaporwave")).toBe(false);
    expect(isVisualStyle(null)).toBe(false);
    // Inherited object properties must not pass for styles.
    expect(isVisualStyle("toString")).toBe(false);
    expect(isVisualStyle("constructor")).toBe(false);
  });
});
