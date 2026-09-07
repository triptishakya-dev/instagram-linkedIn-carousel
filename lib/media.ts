/**
 * Upload rules shared by the browser and the server.
 *
 * Kept free of the AWS SDK on purpose: the composer imports this, and pulling
 * `lib/s3.ts` into a client component would ship the whole S3 client to the
 * browser.
 */

/** Formats both Instagram and LinkedIn will actually accept for an image post. */
export const ALLOWED_IMAGE_MIME = ["image/png", "image/jpeg", "image/webp"] as const;
export type AllowedImageMime = (typeof ALLOWED_IMAGE_MIME)[number];

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const EXTENSION_BY_MIME: Record<AllowedImageMime, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export function isAllowedImageMime(mime: string): mime is AllowedImageMime {
  return (ALLOWED_IMAGE_MIME as readonly string[]).includes(mime);
}

export function extensionForMime(mime: AllowedImageMime): string {
  return EXTENSION_BY_MIME[mime];
}

/** "PNG, JPG or WEBP" — for error copy and upload hints. */
export const ALLOWED_IMAGE_LABEL = "PNG, JPG or WEBP";

/* ------------------------------------------------------- asset library tier -- */

/**
 * The asset library is broader than a post: it holds source imagery, brand
 * logos, clips and reference PDFs. Post media stays restricted to
 * `ALLOWED_IMAGE_MIME` above, because that is what Instagram and LinkedIn will
 * accept — the two limits are deliberately different, and `POST /api/posts`
 * re-checks its own before attaching anything.
 */
export const ALLOWED_ASSET_MIME = [
  ...ALLOWED_IMAGE_MIME,
  "image/gif",
  "image/avif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "application/pdf",
] as const;

export type AllowedAssetMime = (typeof ALLOWED_ASSET_MIME)[number];

/** Matches the "up to 25 MB" the upload dialog advertises. */
export const MAX_ASSET_BYTES = 25 * 1024 * 1024;

const ASSET_EXTENSION_BY_MIME: Record<AllowedAssetMime, string> = {
  ...EXTENSION_BY_MIME,
  "image/gif": "gif",
  "image/avif": "avif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "application/pdf": "pdf",
};

export function isAllowedAssetMime(mime: string): mime is AllowedAssetMime {
  return (ALLOWED_ASSET_MIME as readonly string[]).includes(mime);
}

export function extensionForAssetMime(mime: AllowedAssetMime): string {
  return ASSET_EXTENSION_BY_MIME[mime];
}

export type AssetKindValue = "IMAGE" | "LOGO" | "VIDEO" | "DOCUMENT";

/**
 * What the library calls a file, derived from its type. A logo cannot be
 * inferred from the bytes, so the caller passes that in explicitly.
 */
export function assetKindForMime(mime: string): AssetKindValue {
  if (mime.startsWith("video/")) return "VIDEO";
  if (mime.startsWith("image/")) return "IMAGE";
  return "DOCUMENT";
}

export const ALLOWED_ASSET_LABEL = "PNG, JPG, WEBP, GIF, AVIF, MP4, MOV, WEBM or PDF";
