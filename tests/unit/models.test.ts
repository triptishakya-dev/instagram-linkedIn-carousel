import { describe, expect, it } from "vitest";
import { createModelSchema, updateModelSchema } from "@/lib/validation/model";

describe("AI Model API Validation Schema Tests", () => {
  it("validates createModelSchema input", () => {
    const validModelInput = {
      label: "Claude 3.5 Sonnet",
      provider: "Anthropic",
      role: "both",
      inputPricePerMTokInr: 268,
      outputPricePerMTokInr: 1340,
      maxTokens: 8192,
      temperature: 0.7,
      enabled: true,
      key: "sk-ant-api03-samplekey",
    };

    const parsed = createModelSchema.parse(validModelInput);
    expect(parsed.label).toBe("Claude 3.5 Sonnet");
    expect(parsed.provider).toBe("Anthropic");
    expect(parsed.role).toBe("BOTH");
    expect(parsed.inputPricePerMTokInr).toBe(268);
    expect(parsed.maxTokens).toBe(8192);
  });

  it("validates updateModelSchema partial updates", () => {
    const updateInput = {
      temperature: 0.5,
      enabled: false,
    };

    const parsed = updateModelSchema.parse(updateInput);
    expect(parsed.temperature).toBe(0.5);
    expect(parsed.enabled).toBe(false);
  });

  it("rejects model creation with empty label or provider", () => {
    const invalidInput = {
      label: "",
      provider: "",
    };

    expect(() => createModelSchema.parse(invalidInput)).toThrow();
  });
});

describe("updateModelSchema is a partial update, not a reset", () => {
  /**
   * `createModelSchema.partial()` looked like a partial-update schema and was
   * not: `.partial()` makes a key optional, but a `.default()` on that key
   * still fires when the key is absent. The UI edits one field at a time, so
   * every card edit carried a full set of defaults behind it.
   */
  it("returns only the keys the caller sent", () => {
    expect(updateModelSchema.parse({ role: "SLIDES" })).toEqual({ role: "SLIDES" });
  });

  // The worst case: saving a provider key reset the row's role to BOTH and
  // blanked its pricing, because `rotateModelKey` sends `{ key }` alone.
  it("does not resurrect role or pricing when only a key is sent", () => {
    const parsed = updateModelSchema.parse({ key: "sk-rotated" });

    expect(parsed).toEqual({ key: "sk-rotated" });
    expect(parsed.role).toBeUndefined();
    expect(parsed.inputPricePerMTokInr).toBeUndefined();
    expect(parsed.maxTokens).toBeUndefined();
    expect(parsed.enabled).toBeUndefined();
  });

  it("still validates the keys it is given", () => {
    expect(() => updateModelSchema.parse({ maxTokens: 5 })).toThrow();
    expect(() => updateModelSchema.parse({ temperature: 3 })).toThrow();
    expect(updateModelSchema.parse({ role: "slides" }).role).toBe("SLIDES");
  });

  // Creating a row has no prior value to preserve, so defaults still apply.
  it("leaves create defaults intact", () => {
    const parsed = createModelSchema.parse({ label: "L", provider: "P" });

    expect(parsed.role).toBe("BOTH");
    expect(parsed.maxTokens).toBe(4000);
    expect(parsed.enabled).toBe(true);
  });
});
