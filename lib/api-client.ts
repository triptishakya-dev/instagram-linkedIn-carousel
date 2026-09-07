import {
  ALLOWED_ASSET_LABEL,
  ALLOWED_IMAGE_LABEL,
  MAX_ASSET_BYTES,
  MAX_UPLOAD_BYTES,
  isAllowedAssetMime,
  isAllowedImageMime,
} from "./media";

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

/* ---------------------------------------------------------- asset library -- */

export type AssetRecord = {
  id: string;
  name: string;
  kind: "IMAGE" | "LOGO" | "VIDEO" | "DOCUMENT";
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  tags: string[];
  storageKey: string;
  previewUrl: string | null;
  usedInPostIds: string[];
  createdAt: string;
  updatedAt: string;
};

/**
 * Width and height as the browser sees them, so the library can warn about
 * crops without the server having to decode the file.
 *
 * Resolves to nulls for anything that is not a still image, and for an image
 * the browser cannot decode — neither is worth failing an upload over.
 */
async function probeDimensions(
  file: File,
): Promise<{ width: number | null; height: number | null }> {
  if (!file.type.startsWith("image/")) return { width: null, height: null };

  const url = URL.createObjectURL(file);
  try {
    const bitmap = await createImageBitmap(file);
    const dims = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dims;
  } catch {
    return { width: null, height: null };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * PUTs to a presigned URL with progress.
 *
 * `fetch` cannot report upload progress, so this one call stays on XHR — the
 * upload dialog shows a real percentage rather than an animated guess.
 */
function putWithProgress(
  url: string,
  file: File,
  contentType: string,
  onProgress?: (pct: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    xhr.setRequestHeader("Content-Type", contentType);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.((e.loaded / e.total) * 100);
    };

    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(
            new ApiClientError(xhr.status, {
              code: "MEDIA_REJECTED",
              message: `Storage refused the upload (${xhr.status}).`,
              field: "media",
            }),
          );

    xhr.onerror = () =>
      reject(
        new ApiClientError(0, {
          code: "MEDIA_REJECTED",
          message: "Could not reach storage. Check the bucket's CORS rule.",
          field: "media",
        }),
      );

    xhr.onabort = () => reject(new DOMException("Upload aborted", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });

    xhr.send(file);
  });
}

/**
 * The full journey for one library file: sign, send the bytes straight to S3,
 * then record the row. Returns the persisted asset, so the caller can drop its
 * optimistic placeholder rather than keep a blob URL alive.
 */
export async function uploadAsset(
  file: File,
  opts: {
    kind?: "IMAGE" | "LOGO" | "VIDEO" | "DOCUMENT";
    tags?: string[];
    onProgress?: (pct: number) => void;
    signal?: AbortSignal;
  } = {},
): Promise<AssetRecord> {
  if (!isAllowedAssetMime(file.type)) {
    throw new ApiClientError(400, {
      code: "MEDIA_REJECTED",
      message: `${ALLOWED_ASSET_LABEL} only — ${file.type || "that file type"} is not supported.`,
      field: "media",
    });
  }

  if (file.size > MAX_ASSET_BYTES) {
    throw new ApiClientError(400, {
      code: "MEDIA_REJECTED",
      message: `File must be under ${Math.floor(MAX_ASSET_BYTES / 1024 / 1024)} MB.`,
      field: "media",
    });
  }

  const presignRes = await fetch("/api/uploads/presign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      scope: "asset",
      fileName: file.name,
      contentType: file.type,
      sizeBytes: file.size,
    }),
    signal: opts.signal,
  });

  if (!presignRes.ok) await readError(presignRes);
  const { url, key, contentType } = await presignRes.json();

  await putWithProgress(url, file, contentType, opts.onProgress, opts.signal);

  const { width, height } = await probeDimensions(file);

  const createRes = await fetch("/api/assets", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      key,
      name: file.name,
      kind: opts.kind,
      width,
      height,
      tags: opts.tags ?? [],
    }),
    signal: opts.signal,
  });

  if (!createRes.ok) await readError(createRes);
  return createRes.json();
}

export async function listAssets(signal?: AbortSignal): Promise<AssetRecord[]> {
  const res = await fetch("/api/assets", { signal });
  if (!res.ok) await readError(res);
  return (await res.json()).assets;
}

export async function updateAsset(
  id: string,
  patch: { name?: string; kind?: string; tags?: string[] },
): Promise<AssetRecord> {
  const res = await fetch(`/api/assets/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) await readError(res);
  return res.json();
}

export async function deleteAsset(id: string): Promise<void> {
  const res = await fetch(`/api/assets/${id}`, { method: "DELETE" });
  if (!res.ok) await readError(res);
}
