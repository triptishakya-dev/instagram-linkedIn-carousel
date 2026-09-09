/**
 * Reference images: the assets an image call is given as *pictures*, not words.
 *
 * A goal can name three kinds of asset — a brand logo, style references, and
 * per-slide source images — and every one of them was previously resolved by
 * `resolve-prompt.ts` and then dropped on the floor: `GenerationPlan` had no
 * field to carry them and no adapter had a parameter to receive them. A
 * reference image the user picked never reached the model in any form.
 *
 * This module is the selection half of the fix, and it is deliberately pure:
 * which assets are eligible, in what order, and under what limits is decided
 * from `Asset` metadata alone, before a single byte is fetched. `Asset.sizeBytes`
 * is recorded at upload, so the byte budget can be enforced without downloading
 * anything that would only be discarded.
 *
 * The bytes themselves are read by `load-references.ts`, which is separate so
 * this can be tested without a database or a bucket.
 */

import { isAllowedImageMime } from "@/lib/media";
import type { ReferenceKind } from "@/prompt/image-generator";

/**
 * What a reference asset is doing in the call.
 *
 * The role is not cosmetic — it sets precedence. A logo is a constraint the
 * output must satisfy; a `source` is the picture this specific slide is derived
 * from; a `reference` informs style and treatment across the whole post. The
 * order is also the order they are handed to the model.
 */
export type ReferenceRole = ReferenceKind;

/** An asset chosen as an image input, before its bytes are read. */
export type ReferenceAssetRef = {
  assetId: string;
  storageKey: string;
  mime: string;
  /** The library name, so prompt text and logs can say which picture is which. */
  name: string;
  sizeBytes: number;
  role: ReferenceRole;
};

/** A reference asset with its bytes, ready to hand to a provider. */
export type ReferenceImage = ReferenceAssetRef & { bytes: Buffer };

/** An asset the user picked that cannot be sent, and why. */
export type SkippedReference = {
  assetId: string;
  name: string;
  reason: string;
};

/**
 * Caps on what one image call may carry.
 *
 * `maxImages` is well under what either provider accepts (gpt-image-1 takes 16)
 * because every reference is billed as input tokens on both of them, on every
 * slide of a carousel — eight slides times four references is thirty-two image
 * inputs for one post. Four is enough to express a logo, a source and two style
 * references.
 *
 * `maxTotalBytes` exists because Gemini's `generateContent` carries references
 * inline as base64 in the request body and rejects the request past roughly
 * 20MB. Base64 inflates by a third, so the budget is set on the raw bytes with
 * room to spare for the prompt itself.
 */
export const REFERENCE_LIMITS = {
  maxImages: 4,
  maxTotalBytes: 12 * 1024 * 1024,
} as const;

export type ReferenceLimits = {
  maxImages: number;
  maxTotalBytes: number;
};

/**
 * Narrows a list of candidate assets to the ones that can actually be sent.
 *
 * Input order is precedence order and is preserved: the caller lists the logo
 * first, then this slide's own source image, then the goal's style references,
 * so anything dropped by a cap is dropped from the least load-bearing end.
 *
 * Three things disqualify an asset, and each is reported rather than silently
 * swallowed — a user who attached a reference and got a picture that ignores it
 * is owed the reason:
 *
 *   - A type no image model accepts. The asset library holds PDFs, GIFs, AVIF
 *     and video; the intersection both providers take as an image input is
 *     PNG, JPEG and WEBP, which is exactly `ALLOWED_IMAGE_MIME`.
 *   - A duplicate. The same asset is routinely both the brand logo and a style
 *     reference, and sending it twice pays for it twice while telling the model
 *     nothing new. The first (highest-precedence) role wins.
 *   - No room left under either cap.
 */
export function selectReferenceAssets(
  candidates: ReferenceAssetRef[],
  limits: ReferenceLimits = REFERENCE_LIMITS,
): { selected: ReferenceAssetRef[]; skipped: SkippedReference[] } {
  const selected: ReferenceAssetRef[] = [];
  const skipped: SkippedReference[] = [];
  const seen = new Set<string>();
  let totalBytes = 0;

  for (const candidate of candidates) {
    const { assetId, name } = candidate;

    if (seen.has(assetId)) continue;

    if (!isAllowedImageMime(candidate.mime)) {
      seen.add(assetId);
      skipped.push({
        assetId,
        name,
        reason: `${candidate.mime || "an unknown type"} cannot be used as an image reference (PNG, JPG or WEBP only)`,
      });
      continue;
    }

    if (selected.length >= limits.maxImages) {
      skipped.push({
        assetId,
        name,
        reason: `only ${limits.maxImages} reference images are sent per image`,
      });
      continue;
    }

    // A single asset over the whole budget is reported against the budget
    // rather than as "no room left", which would be misleading when it is the
    // first one considered.
    if (totalBytes + candidate.sizeBytes > limits.maxTotalBytes) {
      skipped.push({
        assetId,
        name,
        reason: `it does not fit the ${Math.round(limits.maxTotalBytes / (1024 * 1024))}MB reference budget for one image call`,
      });
      continue;
    }

    seen.add(assetId);
    totalBytes += candidate.sizeBytes;
    selected.push(candidate);
  }

  return { selected, skipped };
}

/**
 * The candidate list for one slide, in precedence order.
 *
 * `slideSources` is index-matched to slide order the way the goal editor's
 * "Slide images — order maps to slide order" promises, so slide 3 is given the
 * third picture and not all of them. A carousel with fewer pictures than slides
 * simply has slides with no source, which is not an error.
 */
export function referenceCandidatesForSlide(input: {
  order: number;
  logo: ReferenceAssetRef | null;
  slideSources: readonly (ReferenceAssetRef | null)[];
  references: readonly ReferenceAssetRef[];
}): ReferenceAssetRef[] {
  const source = input.slideSources[input.order] ?? null;

  return [input.logo, source, ...input.references].filter(
    (ref): ref is ReferenceAssetRef => ref !== null,
  );
}
