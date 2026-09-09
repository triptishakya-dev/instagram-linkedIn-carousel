import { describe, expect, it } from "vitest";
import {
  REFERENCE_LIMITS,
  referenceCandidatesForSlide,
  selectReferenceAssets,
  type ReferenceAssetRef,
} from "@/lib/generation/reference-image";
import { withReferenceGuidance } from "@/prompt/image-generator";

function asset(over: Partial<ReferenceAssetRef> = {}): ReferenceAssetRef {
  return {
    assetId: "ast_1",
    storageKey: "assets/u1/ast_1.png",
    mime: "image/png",
    name: "Studio shot",
    sizeBytes: 100_000,
    role: "reference",
    ...over,
  };
}

describe("selecting reference assets", () => {
  it("keeps an ordinary image reference", () => {
    const { selected, skipped } = selectReferenceAssets([asset()]);

    expect(selected).toHaveLength(1);
    expect(skipped).toEqual([]);
  });

  it("preserves the caller's precedence order", () => {
    const { selected } = selectReferenceAssets([
      asset({ assetId: "logo", role: "logo" }),
      asset({ assetId: "src", role: "source" }),
      asset({ assetId: "ref", role: "reference" }),
    ]);

    expect(selected.map((r) => r.assetId)).toEqual(["logo", "src", "ref"]);
  });

  it("drops a type no image model accepts, and says which", () => {
    const { selected, skipped } = selectReferenceAssets([
      asset({ assetId: "pdf", mime: "application/pdf", name: "Brand book" }),
      asset({ assetId: "mp4", mime: "video/mp4", name: "Sizzle reel" }),
      asset({ assetId: "png" }),
    ]);

    expect(selected.map((r) => r.assetId)).toEqual(["png"]);
    expect(skipped.map((s) => s.assetId)).toEqual(["pdf", "mp4"]);
    // The reason has to name the file, or a run note is unactionable.
    expect(skipped[0].name).toBe("Brand book");
    expect(skipped[0].reason).toContain("application/pdf");
  });

  it("sends an asset once when it is both the logo and a reference", () => {
    const { selected } = selectReferenceAssets([
      asset({ assetId: "dup", role: "logo" }),
      asset({ assetId: "dup", role: "reference" }),
    ]);

    expect(selected).toHaveLength(1);
    // The higher-precedence role is the one that survives.
    expect(selected[0].role).toBe("logo");
  });

  it("caps the count and reports what did not fit", () => {
    const many = Array.from({ length: REFERENCE_LIMITS.maxImages + 2 }, (_, i) =>
      asset({ assetId: `ast_${i}`, name: `Reference ${i}` }),
    );

    const { selected, skipped } = selectReferenceAssets(many);

    expect(selected).toHaveLength(REFERENCE_LIMITS.maxImages);
    expect(skipped).toHaveLength(2);
    expect(skipped[0].reason).toContain(String(REFERENCE_LIMITS.maxImages));
  });

  it("enforces the byte budget from stored metadata, before any download", () => {
    const { selected, skipped } = selectReferenceAssets([
      asset({ assetId: "big", sizeBytes: REFERENCE_LIMITS.maxTotalBytes }),
      asset({ assetId: "second", sizeBytes: 1 }),
    ]);

    expect(selected.map((r) => r.assetId)).toEqual(["big"]);
    expect(skipped[0].assetId).toBe("second");
    expect(skipped[0].reason).toContain("budget");
  });

  it("selects nothing when the goal attached nothing", () => {
    expect(selectReferenceAssets([])).toEqual({ selected: [], skipped: [] });
  });
});

describe("per-slide reference candidates", () => {
  const logo = asset({ assetId: "logo", role: "logo" });
  const refs = [asset({ assetId: "ref_a" }), asset({ assetId: "ref_b" })];
  const sources = [
    asset({ assetId: "src_0", role: "source" }),
    asset({ assetId: "src_1", role: "source" }),
  ];

  it("gives a slide its own source image, not the whole list", () => {
    const candidates = referenceCandidatesForSlide({
      order: 1,
      logo,
      slideSources: sources,
      references: refs,
    });

    expect(candidates.map((c) => c.assetId)).toEqual(["logo", "src_1", "ref_a", "ref_b"]);
  });

  it("holds a deleted source's place so later slides do not shift onto it", () => {
    const candidates = referenceCandidatesForSlide({
      order: 1,
      logo: null,
      // Slide 0's picture was deleted; slide 1 must still get its own.
      slideSources: [null, sources[1]],
      references: [],
    });

    expect(candidates.map((c) => c.assetId)).toEqual(["src_1"]);
  });

  it("is fine with a carousel longer than its list of pictures", () => {
    const candidates = referenceCandidatesForSlide({
      order: 7,
      logo: null,
      slideSources: sources,
      references: refs,
    });

    expect(candidates.map((c) => c.assetId)).toEqual(["ref_a", "ref_b"]);
  });

  it("yields nothing when the goal names no assets at all", () => {
    expect(
      referenceCandidatesForSlide({ order: 0, logo: null, slideSources: [], references: [] }),
    ).toEqual([]);
  });
});

describe("reference guidance in the prompt", () => {
  it("returns the prompt untouched when there are no references", () => {
    expect(withReferenceGuidance("A red bicycle", [])).toBe("A red bicycle");
  });

  it("names each attachment and the part it plays, in order", () => {
    const composed = withReferenceGuidance("A red bicycle", [
      { role: "logo", name: "Acme mark" },
      { role: "reference", name: "Studio shot" },
    ]);

    // The written instruction stays first: the manifest is an appendix to it.
    expect(composed.startsWith("A red bicycle")).toBe(true);
    expect(composed).toContain("2 reference images are attached");
    expect(composed).toContain(`1. "Acme mark" — the brand logo.`);
    expect(composed).toContain(`2. "Studio shot" — a style and treatment reference.`);
  });

  it("says nothing about what to do with a reference", () => {
    const composed = withReferenceGuidance("A red bicycle", [
      { role: "reference", name: "Studio shot" },
    ]);

    // Rules 3, 5, 8 and 10 own that, once, in `prompt/system-rules.ts`. This
    // function restating them is the duplication the split removed, and a
    // request carrying two precedence ladders is one a model can split the
    // difference on.
    expect(composed).not.toMatch(/adapt|obey|in this order|do not reproduce/i);
  });

  it("reads correctly for a single reference", () => {
    const composed = withReferenceGuidance("A red bicycle", [
      { role: "source", name: "Frame photo" },
    ]);

    expect(composed).toContain("1 reference image is attached");
  });
});
