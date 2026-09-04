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
