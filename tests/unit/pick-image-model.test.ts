import { describe, expect, it } from "vitest";
import { pickImageModel, type ModelRow } from "@/lib/generation/pick-model";

const row = (over: Partial<ModelRow> = {}): ModelRow => ({
  id: "mdl_img",
  label: "GPT Image",
  apiModelId: "gpt-image-1",
  enabled: true,
  inputPricePerMTokInr: 100,
  outputPricePerMTokInr: 200,
  role: "SLIDES",
  ...over,
});

describe("pickImageModel", () => {
  it("uses the configured slide model", () => {
    const choice = pickImageModel({ workspaceModel: row() });
    expect(choice.apiModelId).toBe("gpt-image-1");
    expect(choice.modelRowId).toBe("mdl_img");
    expect(choice.fallbackReason).toBeNull();
  });

  it("accepts a BOTH row for slides", () => {
    expect(pickImageModel({ workspaceModel: row({ role: "BOTH" }) }).apiModelId).toBe("gpt-image-1");
  });

  it("names whatever model the row asks for, without a second opinion", () => {
    // The database is the authority: the proxy routes what it is given.
    expect(pickImageModel({ workspaceModel: row({ apiModelId: "some-new-model" }) }).apiModelId).toBe(
      "some-new-model",
    );
  });

  it("carries the row's rates so cost is the user's own pricing", () => {
    expect(pickImageModel({ workspaceModel: row() }).rates).toEqual({
      inputPricePerMTokInr: 100,
      outputPricePerMTokInr: 200,
    });
  });

  it("refuses rather than falling back when nothing is configured", () => {
    expect(() => pickImageModel({ workspaceModel: null })).toThrow(/No slide model is configured/);
  });

  it("refuses a caption-only row", () => {
    expect(() => pickImageModel({ workspaceModel: row({ role: "CAPTION" }) })).toThrow(/captions only/);
  });

  it("refuses a disabled row", () => {
    expect(() => pickImageModel({ workspaceModel: row({ enabled: false }) })).toThrow(/is disabled/);
  });

  it("refuses a row with no API model id", () => {
    expect(() => pickImageModel({ workspaceModel: row({ apiModelId: null }) })).toThrow(
      /no API model id/,
    );
  });

  // Same gap as the caption side: the row exists, the settings pointer at it
  // does not, because a different screen writes each one.
  it("uses the only eligible configured model when no default names one", () => {
    const choice = pickImageModel({
      workspaceModel: null,
      available: [row({ id: "mdl_only", label: "GPT Image", role: "BOTH" })],
    });

    expect(choice.modelRowId).toBe("mdl_only");
    expect(choice.fallbackReason).toMatch(/No default slide model is set/);
  });

  it("skips caption-only and disabled rows when searching", () => {
    const choice = pickImageModel({
      workspaceModel: null,
      available: [
        row({ id: "txt", label: "Caption only", role: "CAPTION" }),
        row({ id: "off", label: "Disabled", enabled: false }),
        row({ id: "good", label: "Renderer" }),
      ],
    });

    expect(choice.modelRowId).toBe("good");
  });

  it("asks rather than guessing when several rows could serve", () => {
    expect(() =>
      pickImageModel({
        workspaceModel: null,
        available: [row({ id: "a", label: "Imagen" }), row({ id: "b", label: "GPT Image" })],
      }),
    ).toThrow(/Imagen - gpt-image-1, GPT Image - gpt-image-1[\s\S]*Set the slide default/);
  });

  it("still refuses when no configured row can render", () => {
    expect(() =>
      pickImageModel({ workspaceModel: null, available: [row({ role: "CAPTION" })] }),
    ).toThrow(/No slide model is configured/);
  });
});
