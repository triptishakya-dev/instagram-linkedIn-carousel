import { randomUUID } from "node:crypto";
import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import {
  ALLOWED_IMAGE_MIME,
  MAX_UPLOAD_BYTES,
  extensionForMime,
  isAllowedImageMime,
  type AllowedImageMime,
} from "./media";

// Re-exported so server code has one import for everything storage-related.
export {
  ALLOWED_IMAGE_MIME,
  MAX_UPLOAD_BYTES,
  extensionForMime,
  isAllowedImageMime,
  type AllowedImageMime,
};

/** How long a presigned PUT stays usable. Long enough for a slow phone upload. */
export const PRESIGN_EXPIRY_SECONDS = 300;

/* ------------------------------------------------------------------ config -- */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}.`);
  return value;
}

export function bucketName(): string {
  return requireEnv("AWS_BUCKET_NAME");
}

let client: S3Client | undefined;

/**
 * Built lazily so importing this module in a context without credentials (a
 * unit test, a build step) does not throw.
 *
 * Credentials are passed explicitly: this project's env uses AWS_ACCESS_KEY /
 * AWS_SECRET_KEY, and the SDK's default chain only looks for the longer
 * AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY names — it would find nothing.
 */
export function s3(): S3Client {
  if (!client) {
    client = new S3Client({
      region: requireEnv("AWS_REGION"),
      credentials: {
        accessKeyId: requireEnv("AWS_ACCESS_KEY"),
        secretAccessKey: requireEnv("AWS_SECRET_KEY"),
      },
      /**
       * Recent SDK versions compute a checksum by default, which puts
       * `x-amz-checksum-crc32` for an *empty* body into every presigned PUT.
       * The browser then sends real bytes, S3 compares them against that
       * checksum, and the upload dies with BadDigest. WHEN_REQUIRED keeps the
       * checksum off unless an operation actually mandates one.
       */
      requestChecksumCalculation: "WHEN_REQUIRED",
    });
  }
  return client;
}

/** Test seam: drops the memoised client so env changes take effect. */
export function resetS3Client() {
  client = undefined;
}

/* -------------------------------------------------------------------- keys -- */

/**
 * Where a browser upload lands before it belongs to a post. A lifecycle rule
 * expiring the `tmp/` prefix after a day collects abandoned composer sessions,
 * so nothing here needs cleaning up by hand.
 */
export function buildTmpKey(userId: string, mime: AllowedImageMime): string {
  return `tmp/${userId}/${randomUUID()}.${extensionForMime(mime)}`;
}

/** Final resting place, once the post row exists to name it. */
export function buildPostKey(
  userId: string,
  postId: string,
  order: number,
  mime: AllowedImageMime,
): string {
  return `posts/${userId}/${postId}/${order}.${extensionForMime(mime)}`;
}

/**
 * Guards the attach step. Without this a client could hand us any key in the
 * bucket — including another user's — and have it copied into its own post.
 */
export function isOwnedTmpKey(key: string, userId: string): boolean {
  if (key.includes("..") || key.includes("//") || key.startsWith("/")) return false;
  const prefix = `tmp/${userId}/`;
  if (!key.startsWith(prefix)) return false;
  // Exactly one path segment after the prefix.
  const rest = key.slice(prefix.length);
  return rest.length > 0 && !rest.includes("/");
}

/**
 * The URL stored on PostMedia. Instagram's Graph API fetches `image_url`
 * itself, so objects under `posts/` have to be publicly readable — a presigned
 * GET would expire mid-publish.
 */
export function publicUrlFor(key: string): string {
  const base = process.env.S3_PUBLIC_BASE_URL;
  if (base) return `${base.replace(/\/$/, "")}/${key}`;
  return `https://${bucketName()}.s3.${requireEnv("AWS_REGION")}.amazonaws.com/${key}`;
}

/* ----------------------------------------------------------------- objects -- */

export async function presignPut(key: string, contentType: AllowedImageMime): Promise<string> {
  return getSignedUrl(
    s3(),
    new PutObjectCommand({ Bucket: bucketName(), Key: key, ContentType: contentType }),
    { expiresIn: PRESIGN_EXPIRY_SECONDS },
  );
}

export type ObjectHead = { contentType: string | undefined; contentLength: number };

/**
 * What actually landed in the bucket. A presigned PUT cannot enforce the size
 * it was signed for — the client is free to send something else — so every
 * uploaded object is re-measured here before it is attached to a post.
 *
 * Returns null when the object is absent.
 */
export async function headObject(key: string): Promise<ObjectHead | null> {
  try {
    const res = await s3().send(new HeadObjectCommand({ Bucket: bucketName(), Key: key }));
    return { contentType: res.ContentType, contentLength: res.ContentLength ?? 0 };
  } catch (err) {
    const name = (err as { name?: string })?.name;
    const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;

    // A bad bucket name or bad credentials also answer 404/403 here. Reporting
    // those as "the upload is missing" would send the user round in circles
    // re-uploading a file, so only a genuinely absent object returns null.
    if (name === "NoSuchBucket" || name === "AccessDenied" || status === 403) throw err;
    if (name === "NotFound" || name === "NoSuchKey" || status === 404) return null;
    throw err;
  }
}

export async function copyObject(fromKey: string, toKey: string): Promise<void> {
  const bucket = bucketName();
  await s3().send(
    new CopyObjectCommand({
      Bucket: bucket,
      // CopySource is a path, so the key has to be escaped rather than raw.
      CopySource: `${bucket}/${fromKey.split("/").map(encodeURIComponent).join("/")}`,
      Key: toKey,
    }),
  );
}

export async function deleteKeys(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  await s3().send(
    new DeleteObjectsCommand({
      Bucket: bucketName(),
      Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
    }),
  );
}
