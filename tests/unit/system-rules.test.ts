import { describe, expect, it } from "vitest";
import {
  IMAGE_SYSTEM_RULES,
  SYSTEM_RULES_VERSION,
  withSystemRules,
} from "@/prompt/system-rules";
import { withReferenceGuidance } from "@/prompt/image-generator";

describe("the standing image rules", () => {
  it("states all ten rules, numbered", () => {
    for (let n = 1; n <= 10; n += 1) {
      expect(IMAGE_SYSTEM_RULES).toMatch(new RegExp(`^${n}\.`, "m"));
    }

    // An eleventh would mean the numbering drifted from the ruleset the run
    // note names by version.
    expect(IMAGE_SYSTEM_RULES).not.toMatch(/^11\./m);
  });

  it("covers each obligation the rules exist to state", () => {
    const required = [
      "primary instruction", // 1: the goal's prompt wins
      "Attached pictures are part of", // 2: assets are not decoration
      "visibly influence", // 3: references must show in the output
      "stated role", // 4: logo vs reference vs source
      "Explicit beats inferred", // 5
      "one visual language", // 6
      "reproduced as given", // 7
      "do not duplicate", // 8
      "Obey exclusions", // 9
      "as a whole", // 10
    ];

    for (const phrase of required) {
      expect(IMAGE_SYSTEM_RULES).toContain(phrase);
    }
  });

  it("names a version, so a run can be read against the rules it used", () => {
    expect(SYSTEM_RULES_VERSION).toMatch(/^v\d+$/);
  });
});

describe("delivering the rules where there is no system channel", () => {
  it("labels the rules and separates them from this request", () => {
    const composed = withSystemRules("A red bicycle", IMAGE_SYSTEM_RULES);

    expect(composed).toContain("SYSTEM RULES");
    expect(composed).toContain("THIS REQUEST:");
    // The request's own instruction is last, which is where a model looks for
    // what it is being asked to draw.
    expect(composed.endsWith("A red bicycle")).toBe(true);
  });

  it("returns the prompt untouched when no rules are supplied", () => {
    // The regression guard for every request made before this existed.
    expect(withSystemRules("A red bicycle", undefined)).toBe("A red bicycle");
    expect(withSystemRules("A red bicycle", "")).toBe("A red bicycle");
  });
});

describe("the precedence ladder is stated exactly once", () => {
  /**
   * The failure this covers is not a crash: it is two sets of ordering rules,
   * worded slightly differently, arriving in the same request. That reads as
   * fine and generates images that hedge between them, which is why it is
   * asserted over the whole composed request rather than per module.
   */
  it("appears once across rules, guidance and prompt together", () => {
    const request = withSystemRules(
      withReferenceGuidance("A red bicycle", [
        { role: "logo", name: "Acme mark" },
        { role: "reference", name: "Studio shot" },
      ]),
      IMAGE_SYSTEM_RULES,
    );

    expect(request.match(/in this order/gi) ?? []).toHaveLength(1);
    expect(request.match(/do not duplicate|do not reproduce/gi) ?? []).toHaveLength(1);
  });

  it("still names every attachment alongside the rules", () => {
    const request = withSystemRules(
      withReferenceGuidance("A red bicycle", [{ role: "logo", name: "Acme mark" }]),
      IMAGE_SYSTEM_RULES,
    );

    // Deduplicating the ladder must not cost the manifest: the rules can say a
    // logo keeps its proportions, but only the manifest says which picture is
    // the logo.
    expect(request).toContain("Acme mark");
    expect(request).toContain("stated role");
  });
});
