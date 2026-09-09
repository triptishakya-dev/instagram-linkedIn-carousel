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
  /** Route-supplied extras; see `ApiError` in `lib/http.ts`. */
  details?: Record<string, unknown>;
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

  get details() {
    return this.payload.details;
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

/**
 * Removes a post, the slides under it, its publish targets and the objects
 * behind its images.
 *
 * Refused with a 409 while the post is `PROCESSING`: the provider calls are
 * already in flight and dropping the row here would not recall them. A post
 * that has already published is deleted, but only from this workspace — what
 * is live on Instagram or LinkedIn stays up.
 */
export async function deletePost(id: string): Promise<void> {
  const res = await fetch(`/api/posts/${id}`, { method: "DELETE" });
  if (!res.ok) await readError(res);
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

/* ------------------------------------------------------------------ models -- */

export type ModelRoleWire = "CAPTION" | "SLIDES" | "BOTH";

export type ModelRecord = {
  id: string;
  label: string;
  provider: string;
  apiModelId: string | null;
  role: ModelRoleWire;
  inputPricePerMTokInr: number;
  outputPricePerMTokInr: number;
  maxTokens: number;
  temperature: number;
  enabled: boolean;
  keyLast4: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateModelBody = {
  label: string;
  provider: string;
  apiModelId?: string | null;
  role: ModelRoleWire;
  inputPricePerMTokInr: number;
  outputPricePerMTokInr: number;
  maxTokens: number;
  temperature: number;
  enabled: boolean;
  key?: string | null;
};

/** Every field is optional; only what is sent is written. */
export type UpdateModelBody = Partial<CreateModelBody>;

export async function listModels(signal?: AbortSignal): Promise<ModelRecord[]> {
  const res = await fetch("/api/models", { signal });
  if (!res.ok) await readError(res);
  return (await res.json()).models;
}

export async function createModel(body: CreateModelBody): Promise<ModelRecord> {
  const res = await fetch("/api/models", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) await readError(res);
  return res.json();
}

/**
 * Stores a provider key against a model, replacing whatever it had.
 *
 * Separate from `updateModel` so the key never has to pass through the store's
 * model list: it goes from the input straight to the server, and only the last
 * four characters come back. The server encrypts it at rest and sends it with
 * calls for this model in place of the proxy's own key.
 */
export async function rotateModelKey(id: string, key: string): Promise<ModelRecord> {
  const res = await fetch(`/api/models/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key }),
  });
  if (!res.ok) await readError(res);
  return res.json();
}

export async function updateModel(id: string, patch: UpdateModelBody): Promise<ModelRecord> {
  const res = await fetch(`/api/models/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) await readError(res);
  return res.json();
}

/** A goal that names the model, as reported on a 409. */
export type BlockingGoal = { id: string; name: string };

export type DeleteModelResult = {
  deletedId: string;
  /** Goals whose `modelId` was blanked — includes paused and ended ones. */
  clearedGoalCount: number;
  /** Workspace settings keys that had named this model. */
  clearedDefaults: string[];
};

/**
 * Reads the goal list off a 409 from `deleteModel`, or `[]` if the refusal
 * came without one.
 */
export function blockingGoalsOf(err: unknown): BlockingGoal[] {
  if (!(err instanceof ApiClientError) || err.status !== 409) return [];
  const goals = err.details?.goals;
  if (!Array.isArray(goals)) return [];
  return goals.filter(
    (g): g is BlockingGoal =>
      !!g && typeof g === "object" && typeof g.id === "string" && typeof g.name === "string",
  );
}

/**
 * Refused with a 409 while an active goal still names the model, so the user
 * finds out before their next scheduled run has nothing to generate with; the
 * offending goals come back in `details.goals` — read them with
 * `blockingGoalsOf`. `force` accepts the refusal and clears the reference on
 * those goals, and on any workspace default naming the model, instead.
 */
export async function deleteModel(
  id: string,
  opts: { force?: boolean } = {},
): Promise<DeleteModelResult> {
  const query = opts.force ? "?force=true" : "";
  const res = await fetch(`/api/models/${id}${query}`, { method: "DELETE" });
  if (!res.ok) await readError(res);
  return res.json();
}

/* ------------------------------------------------------------------- goals -- */

/** A scheduled post that would be detached, as reported on a 409. */
export type BlockingPost = { id: string; scheduledAt: string | null };

export type DeleteGoalResult = {
  deletedId: string;
  /** Posts whose `goalId` was cleared — every status, not only scheduled. */
  detachedPostCount: number;
  /** How many of those were still scheduled to publish. */
  detachedScheduledCount: number;
};

/**
 * Reads the scheduled-post list off a 409 from `deleteGoal`, or `[]` if the
 * refusal came without one.
 */
export function blockingPostsOf(err: unknown): BlockingPost[] {
  if (!(err instanceof ApiClientError) || err.status !== 409) return [];
  const posts = err.details?.posts;
  if (!Array.isArray(posts)) return [];
  return posts.filter((p): p is BlockingPost => !!p && typeof p === "object" && typeof p.id === "string");
}

/**
 * Refused with a 409 while a scheduled post still comes from the goal, since
 * deleting it would leave that post to fire with no goal behind it; the posts
 * come back in `details.posts` — read them with `blockingPostsOf`. `force`
 * accepts the refusal and detaches them, leaving them scheduled.
 */
export async function deleteGoal(
  id: string,
  opts: { force?: boolean } = {},
): Promise<DeleteGoalResult> {
  const query = opts.force ? "?force=true" : "";
  const res = await fetch(`/api/goals/${id}${query}`, { method: "DELETE" });
  if (!res.ok) await readError(res);
  return res.json();
}

/* ---------------------------------------------------- connected accounts -- */

export type SocialTargetRecord = {
  id: string;
  platform: "INSTAGRAM" | "LINKEDIN";
  targetType: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  isDefault: boolean;
};

export type SocialAccountRecord = {
  id: string;
  platform: "INSTAGRAM" | "LINKEDIN";
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
  isValid: boolean;
  tokenExpiresAt: string | null;
  lastSyncAt: string | null;
  createdAt: string;
  targets: SocialTargetRecord[];
  /** Scheduled posts that would lose a destination if this were disconnected. */
  scheduledPostCount: number;
};

export async function listAccounts(signal?: AbortSignal): Promise<SocialAccountRecord[]> {
  const res = await fetch("/api/accounts", { signal });
  if (!res.ok) await readError(res);
  return (await res.json()).accounts;
}

/**
 * Where the browser goes to authorise Instagram.
 *
 * A location assignment or a plain `<a href>`, never a `fetch`: Meta's consent
 * screen is a page a person has to read and press a button on, so it needs a
 * top-level navigation. A fetch would be refused cross-origin and could not
 * show the screen even if it were not.
 */
export const CONNECT_INSTAGRAM_URL = "/api/accounts/instagram/connect";

export type RefreshAccountResult = {
  /** True when the 60-day token window actually moved. */
  renewed: boolean;
  tokenExpiresAt: string | null;
  username: string | null;
};

/**
 * Renews the access token and re-reads the profile.
 *
 * Instagram Login can extend a long-lived token, so this genuinely keeps a
 * connection alive rather than only reporting on it. It is also what makes
 * `isValid` mean anything: nothing else ever sets it to false.
 *
 * A renewal is refused for a token under 24 hours old, which is why `renewed`
 * is reported separately from success — a brand-new connection is healthy and
 * un-renewed at the same time.
 */
export async function refreshAccount(id: string): Promise<RefreshAccountResult> {
  const res = await fetch(`/api/accounts/${id}/refresh`, { method: "POST" });
  if (!res.ok) await readError(res);
  return res.json();
}

export type DisconnectResult = { deletedId: string; draftedPostCount: number };

/**
 * Refused with a 409 while a scheduled post still targets the account, since
 * the delete cascades that post's publish rows away. `force` accepts it and
 * moves any post left with no destination back to drafts.
 */
export async function deleteAccount(
  id: string,
  opts: { force?: boolean } = {},
): Promise<DisconnectResult> {
  const query = opts.force ? "?force=true" : "";
  const res = await fetch(`/api/accounts/${id}${query}`, { method: "DELETE" });
  if (!res.ok) await readError(res);
  return res.json();
}

/* ---------------------------------------------------- generation runs -- */

export type TriggerRunResult = {
  started: Array<{
    runId: string;
    goalId: string;
    goalName: string;
    workflowId: string;
    platforms: string[];
  }>;
  dateKey: string;
};

export async function triggerRun(opts?: {
  goalIds?: string[];
  slideCount?: number;
}): Promise<TriggerRunResult> {
  const res = await fetch("/api/generate/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(opts ?? {}),
  });
  if (!res.ok) await readError(res);
  return res.json();
}
