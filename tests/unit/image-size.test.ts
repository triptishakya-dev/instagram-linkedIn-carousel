import { describe, expect, it } from "vitest";
import { aspectRatioOf, extensionForImageMime, imageSize } from "@/lib/generation/image-size";

/** A PNG header carrying the given dimensions; nothing else is read. */
function pngHeader(width: number, height: number): Buffer {
  const buf = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8); // IHDR chunk length
  buf.write("IHDR", 12, "ascii");
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

/**
 * A JPEG with an APP0 segment before the SOF0, so the parser has to walk the
 * segment chain rather than read a fixed offset — which is the real shape of
 * every JPEG a camera or model produces.
 */
function jpegWithApp0(width: number, height: number): Buffer {
  const app0Payload = Buffer.alloc(14); // JFIF header contents, unread here
  const app0 = Buffer.concat([
    Buffer.from([0xff, 0xe0]),
    (() => {
      const len = Buffer.alloc(2);
      len.writeUInt16BE(app0Payload.length + 2);
      return len;
    })(),
    app0Payload,
  ]);

  const sofBody = Buffer.alloc(9);
  sofBody.writeUInt16BE(8 + 3, 0); // segment length: precision + dims + comps
  sofBody.writeUInt8(8, 2); // sample precision
  sofBody.writeUInt16BE(height, 3);
  sofBody.writeUInt16BE(width, 5);
  sofBody.writeUInt8(3, 7); // component count
  const sof0 = Buffer.concat([Buffer.from([0xff, 0xc0]), sofBody]);

  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof0, Buffer.from([0xff, 0xd9])]);
}

describe("imageSize — PNG", () => {
  it("reads dimensions from IHDR", () => {
    expect(imageSize(pngHeader(1080, 1350))).toEqual({ width: 1080, height: 1350 });
  });

  it("rejects a PNG signature with no IHDR", () => {
    const buf = pngHeader(100, 100);
    buf.write("IDAT", 12, "ascii");
    expect(imageSize(buf)).toBeNull();
  });
});

describe("imageSize — JPEG", () => {
  it("walks past earlier segments to find the SOF", () => {
    expect(imageSize(jpegWithApp0(1200, 628))).toEqual({ width: 1200, height: 628 });
  });

  // Height comes before width in a SOF, which is easy to get backwards and
  // would silently transpose every generated slide's dimensions.
  it("does not transpose width and height", () => {
    expect(imageSize(jpegWithApp0(800, 1000))).toEqual({ width: 800, height: 1000 });
  });

  it("gives up rather than guessing once the scan data starts", () => {
    const truncated = Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.from([0xff, 0xda, 0x00, 0x02])]);
    expect(imageSize(truncated)).toBeNull();
  });
});

describe("imageSize — unrecognised input", () => {
  // A failed size read must not fail a generation run, so this returns null
  // for anything it cannot parse instead of throwing.
  it("returns null without throwing", () => {
    expect(imageSize(Buffer.alloc(0))).toBeNull();
    expect(imageSize(Buffer.from("not an image at all"))).toBeNull();
    expect(imageSize(Buffer.from([0x47, 0x49, 0x46, 0x38]))).toBeNull();
  });
});

describe("aspectRatioOf", () => {
  it("computes the stored float", () => {
    expect(aspectRatioOf({ width: 1080, height: 1350 })).toBe(0.8);
    expect(aspectRatioOf({ width: 1200, height: 628 })).toBe(1.9108);
  });

  it("survives a null size and a zero height", () => {
    expect(aspectRatioOf(null)).toBeNull();
    expect(aspectRatioOf({ width: 100, height: 0 })).toBeNull();
  });
});

describe("extensionForImageMime", () => {
  it("maps what the image models actually return", () => {
    expect(extensionForImageMime("image/jpeg")).toBe("jpg");
    expect(extensionForImageMime("image/png")).toBe("png");
    expect(extensionForImageMime("image/webp")).toBe("webp");
    expect(extensionForImageMime("application/octet-stream")).toBe("png");
  });
});
