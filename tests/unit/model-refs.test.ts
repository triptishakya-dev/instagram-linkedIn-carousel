import { describe, expect, it } from "vitest";
import { MODEL_REF_SETTING_KEYS, clearModelFromSettings } from "@/lib/model-refs";

describe("clearModelFromSettings", () => {
  it("blanks a default that names the model and reports which key it was", () => {
    const result = clearModelFromSettings(
      { defCaptionModel: "mdl_1", defSlideModel: "mdl_2", defScope: "slide" },
      "mdl_1",
    );

    expect(result).not.toBeNull();
    expect(result!.cleared).toEqual(["defCaptionModel"]);
    expect(result!.settings.defCaptionModel).toBe("");
  });

  it("clears every key naming the model, not just the first", () => {
    const result = clearModelFromSettings(
      { defCaptionModel: "mdl_1", defSlideModel: "mdl_1" },
      "mdl_1",
    );

    expect(result!.cleared).toEqual([...MODEL_REF_SETTING_KEYS]);
    expect(result!.settings).toMatchObject({ defCaptionModel: "", defSlideModel: "" });
  });

  it("leaves unrelated keys untouched", () => {
    const result = clearModelFromSettings(
      { defCaptionModel: "mdl_1", wsName: "Rubenius", bulkThreshold: 2000 },
      "mdl_1",
    );

    expect(result!.settings.wsName).toBe("Rubenius");
    expect(result!.settings.bulkThreshold).toBe(2000);
  });

  it("does not mutate the blob it was given", () => {
    const original = { defCaptionModel: "mdl_1" };
    clearModelFromSettings(original, "mdl_1");

    expect(original.defCaptionModel).toBe("mdl_1");
  });

  // Returning null rather than an unchanged blob is what lets the delete skip
  // the write entirely instead of bumping `updatedAt` on an untouched row.
  it("returns null when no default names the model", () => {
    expect(clearModelFromSettings({ defCaptionModel: "mdl_2" }, "mdl_1")).toBeNull();
    expect(clearModelFromSettings({}, "mdl_1")).toBeNull();
  });

  it("returns null for a blob that is missing or not an object", () => {
    expect(clearModelFromSettings(null, "mdl_1")).toBeNull();
    expect(clearModelFromSettings(undefined, "mdl_1")).toBeNull();
    expect(clearModelFromSettings("mdl_1", "mdl_1")).toBeNull();
    expect(clearModelFromSettings(["mdl_1"], "mdl_1")).toBeNull();
  });

  // An unsaved default is the empty string, and every one of them would match
  // if the comparison were loose.
  it("does not treat an unset default as a match", () => {
    expect(clearModelFromSettings({ defCaptionModel: "", defSlideModel: "" }, "")).toBeNull();
  });
});
