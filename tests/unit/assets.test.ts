import { describe, expect, it } from "vitest";
import {
  ALLOWED_IMAGE_MIME,
  MAX_ASSET_BYTES,
  MAX_UPLOAD_BYTES,
  assetKindForMime,
  extensionForAssetMime,
  isAllowedAssetMime,
  isAllowedImageMime,
} from "@/lib/media";
import { buildAssetKey, isOwnedTmpKey } from "@/lib/s3";
import { createAssetSchema, presignAssetSchema, updateAssetSchema } from "@/lib/validation/asset";

describe("asset media tiers", () => {
  it("keeps the library wider than what a post may publish", () => {
    // Video belongs in the library but must never reach a post's media list.
    expect(isAllowedAssetMime("video/mp4")).toBe(true);
    expect(isAllowedImageMime("video/mp4")).toBe(false);

    expect(MAX_ASSET_BYTES).toBeGreaterThan(MAX_UPLOAD_BYTES);
  });

  it("accepts every post image type in the library too", () => {
    for (const mime of ALLOWED_IMAGE_MIME) {
      expect(isAllowedAssetMime(mime)).toBe(true);
    }
  });

  it("rejects a type that is on neither tier", () => {
    expect(isAllowedAssetMime("application/zip")).toBe(false);
    expect(isAllowedAssetMime("")).toBe(false);
  });

  it("derives the library kind from the type", () => {
    expect(assetKindForMime("image/png")).toBe("IMAGE");
    expect(assetKindForMime("video/quicktime")).toBe("VIDEO");
    expect(assetKindForMime("application/pdf")).toBe("DOCUMENT");
  });

  it("gives each accepted type a file extension", () => {
    expect(extensionForAssetMime("image/jpeg")).toBe("jpg");
    expect(extensionForAssetMime("video/quicktime")).toBe("mov");
    expect(extensionForAssetMime("application/pdf")).toBe("pdf");
  });
});

describe("asset storage keys", () => {
  it("files an asset under its owner and id", () => {
    expect(buildAssetKey("user-1", "asset-9", "image/webp")).toBe(
      "assets/user-1/asset-9.webp",
    );
  });

  it("only claims a tmp key the caller owns", () => {
    expect(isOwnedTmpKey("tmp/user-1/abc.png", "user-1")).toBe(true);
    // Someone else's upload, and a traversal dressed up as one.
    expect(isOwnedTmpKey("tmp/user-2/abc.png", "user-1")).toBe(false);
    expect(isOwnedTmpKey("tmp/user-1/../user-2/abc.png", "user-1")).toBe(false);
    expect(isOwnedTmpKey("assets/user-1/abc.png", "user-1")).toBe(false);
  });
});

describe("asset validation schemas", () => {
  it("signs an upload within the library's limits", () => {
    const parsed = presignAssetSchema.parse({
      fileName: "clip.mp4",
      contentType: "video/mp4",
      sizeBytes: 12_000_000,
    });
    expect(parsed.contentType).toBe("video/mp4");
  });

  it("refuses to sign an upload over the size ceiling", () => {
    expect(() =>
      presignAssetSchema.parse({
        fileName: "huge.png",
        contentType: "image/png",
        sizeBytes: MAX_ASSET_BYTES + 1,
      }),
    ).toThrow();
  });

  it("normalises the kind and defaults the tags", () => {
    const parsed = createAssetSchema.parse({
      key: "tmp/user-1/abc.png",
      name: "logo.png",
      kind: "logo",
    });
    expect(parsed.kind).toBe("LOGO");
    expect(parsed.tags).toEqual([]);
  });

  it("requires a key to tie the row to an uploaded object", () => {
    expect(() => createAssetSchema.parse({ name: "orphan.png" })).toThrow();
  });

  it("rejects an update that changes nothing", () => {
    expect(() => updateAssetSchema.parse({})).toThrow();
    expect(updateAssetSchema.parse({ name: "renamed.png" }).name).toBe("renamed.png");
  });
});
