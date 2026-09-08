import { describe, expect, it } from "vitest";
import { isGeminiImageModel } from "@/lib/generation/render-image";

describe("image provider routing", () => {
  it("routes the Gemini image models to the direct call", () => {
    expect(isGeminiImageModel("gemini-3-pro-image")).toBe(true);
    expect(isGeminiImageModel("gemini-2.5-flash-image")).toBe(true);
  });

  it("routes everything else through the proxy", () => {
    expect(isGeminiImageModel("gpt-image-1")).toBe(false);
    expect(isGeminiImageModel("gemini-flash-latest")).toBe(false);
  });
});
