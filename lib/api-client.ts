import { ALLOWED_IMAGE_LABEL, MAX_UPLOAD_BYTES, isAllowedImageMime } from "./media";

/** The error shape every route returns; see `lib/http.ts`. */
export type ApiErrorPayload = {
  code: string;
  message: string;
  field?: string;
};

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly payload: ApiErrorPayload,
  ) {
    super(payload.message);
    this.name = "ApiClientError";
  }

  get field() {
    return this.payload.field;
  }
}

async function readError(res: Response): Promise<never> {
  let payload: ApiErrorPayload = { code: "INTERNAL", message: `Request failed (${res.status}).` };
  try {
    const body = await res.json();
    if (body?.error?.message) payload = body.error;
  } catch {
    // Non-JSON error body; the default message stands.
  }
  throw new ApiClientError(res.status, payload);
}

/* ----------------------------------------------------------------- uploads -- */

export type UploadResult = { key: string };

/**
 * Two hops: ask the server to sign a URL, then send the bytes straight to S3.
 * Nothing large passes through the Next server.
 */
export async function uploadImage(file: File, signal?: AbortSignal): Promise<UploadResult> {
  if (!isAllowedImageMime(file.type)) {
    throw new ApiClientError(400, {
      code: "MEDIA_REJECTED",
      message: `${ALLOWED_IMAGE_LABEL} only — ${file.type || "that file type"} is not supported.`,
      field: "media",
    });
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ApiClientError(400, {
      code: "MEDIA_REJECTED",
      message: `Image must be under ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`,
      field: "media",
    });
  }

  const presignRes = await fetch("/api/uploads/presign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      contentType: file.type,
      sizeBytes: file.size,
    }),
    signal,
  });

  if (!presignRes.ok) await readError(presignRes);
  const { key, url, contentType } = await presignRes.json();

  const putRes = await fetch(url, {
    method: "PUT",
    // Must match what was signed, or S3 rejects the signature.
    headers: { "content-type": contentType },
    body: file,
    signal,
  });

  if (!putRes.ok) {
    throw new ApiClientError(putRes.status, {
      code: "MEDIA_REJECTED",
      message: `Storage refused the upload (${putRes.status}). Try again.`,
      field: "media",
    });
  }

  return { key };
}

/* ------------------------------------------------------------------- posts -- */

export type CreatePostBody = {
  caption: string;
  captionPrompt?: string | null;
  platforms: ("INSTAGRAM" | "LINKEDIN")[];
  date: string;
  time: string;
  timezone: string;
  staleAfterMinutes: number;
  media: { key: string; order: number }[];
};

export type CreatePostResult = {
  id: string;
  status: string;
  scheduledAt: string;
  mediaCount?: number;
  publishTargetCount?: number;
  unconnectedPlatforms?: string[];
  replayed?: boolean;
};

/**
 * `idempotencyKey` makes a retried submit — a double click, a flaky network —
 * return the post that was already created instead of scheduling it twice.
 */
export async function createPost(
  body: CreatePostBody,
  idempotencyKey: string,
): Promise<CreatePostResult> {
  const res = await fetch("/api/posts", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) await readError(res);
  return res.json();
}
