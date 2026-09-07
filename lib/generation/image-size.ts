/**
 * Pixel dimensions read straight out of the file header.
 *
 * `PostMedia` stores width, height and aspect ratio, and the media details
 * panel shows them. Rather than pull in an image library for two numbers, this
 * reads the handful of header bytes that carry them — the generated files are
 * always PNG or JPEG, because that is what Gemini returns.
 *
 * Returns null rather than throwing on anything unrecognised: not knowing a
 * slide's dimensions is not a reason to fail a generation run.
 */

export type ImageSize = { width: number; height: number };

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Start-of-frame markers, which is where a JPEG records its size. */
const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function pngSize(buf: Buffer): ImageSize | null {
  // Signature (8) + length (4) + "IHDR" (4) + width (4) + height (4).
  if (buf.length < 24) return null;
  if (!buf.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  if (buf.subarray(12, 16).toString("ascii") !== "IHDR") return null;

  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function jpegSize(buf: Buffer): ImageSize | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;

  // Walk the segment chain. Each segment is 0xFF, a marker, then a two-byte
  // length that includes those length bytes but not the marker.
  let offset = 2;

  while (offset + 3 < buf.length) {
    if (buf[offset] !== 0xff) {
      // Padding byte between segments is legal; skip it rather than give up.
      offset += 1;
      continue;
    }

    const marker = buf[offset + 1];

    // Standalone markers carry no length payload.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    // Start of scan: the compressed data begins, so the size is not ahead.
    if (marker === 0xda || marker === 0xd9) return null;

    const length = buf.readUInt16BE(offset + 2);
    if (length < 2) return null;

    if (JPEG_SOF_MARKERS.has(marker)) {
      // Within a SOF: precision (1), height (2), width (2).
      if (offset + 9 >= buf.length) return null;
      return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) };
    }

    offset += 2 + length;
  }

  return null;
}

export function imageSize(bytes: Buffer): ImageSize | null {
  return pngSize(bytes) ?? jpegSize(bytes);
}

/** Aspect ratio as the float `PostMedia.aspectRatio` stores. */
export function aspectRatioOf(size: ImageSize | null): number | null {
  if (!size || size.height === 0) return null;
  return Math.round((size.width / size.height) * 10000) / 10000;
}

/** File extension for a mime type, for the S3 key. */
export function extensionForImageMime(mime: string): string {
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  if (mime === "image/webp") return "webp";
  return "png";
}
