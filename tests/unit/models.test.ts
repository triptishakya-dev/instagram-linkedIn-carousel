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
