/**
 * Translation between what the API stores and what the views render.
 *
 * The database speaks Prisma enums (`SCHEDULED`, `INSTAGRAM`, `IMAGE`); the
 * views were written against lowercase unions. Keeping the conversion in one
 * file means neither side has to know about the other's casing.
 */

import type { AssetRecord, ModelRecord, ModelRoleWire, UpdateModelBody } from "../api-client";
import { TINTS } from "./data";
import type { Asset, AssetKind, Model, ModelRole, Platform, Post, PostState, Slide } from "./types";

/** Stable swatch per asset, so a row keeps its colour across reloads. */
function tintFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return TINTS[hash % TINTS.length];
}

export function toRedsAsset(a: AssetRecord): Asset {
  return {
    id: a.id,
    name: a.name,
    kind: a.kind.toLowerCase() as AssetKind,
    mimeType: a.mimeType,
    sizeBytes: a.sizeBytes,
    width: a.width ?? 0,
    height: a.height ?? 0,
    tags: a.tags ?? [],
    usedInPostIds: a.usedInPostIds ?? [],
    uploadedBy: "You",
    uploadedAt: a.createdAt,
    tint: tintFor(a.id),
    previewUrl: a.previewUrl ?? undefined,
  };
}

const STATE_BY_STATUS: Record<string, PostState> = {
  DRAFT: "draft",
  SCHEDULED: "scheduled",
  PROCESSING: "generating",
  PUBLISHED: "published",
  PARTIALLY_PUBLISHED: "published",
  FAILED: "failed",
  CANCELLED: "draft",
};

type ApiPostMedia = {
  id: string;
  order: number;
  url: string;
  previewUrl?: string | null;
  width?: number | null;
  height?: number | null;
};

type ApiPost = {
  id: string;
  goalId: string | null;
  /**
   * Already present in the list payload: `GET /api/posts` selects rows with
   * Prisma `include`, so every column ships. It was simply dropped here.
   */
  generationRunId?: string | null;
  caption: string | null;
  status: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  intendedPlatforms: string[];
  media?: ApiPostMedia[];
  modelId?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  estimatedCostInr?: number | null;
  generationMs?: number | null;
  runCount?: number | null;
  createdAt: string;
  updatedAt: string;
};

/** Hashtags are part of the caption in the database; the table shows them apart. */
function splitHashtags(caption: string): string[] {
  return caption.match(/#[\p{L}\p{N}_]+/gu) ?? [];
}

export function toRedsPost(p: ApiPost): Post {
  const caption = p.caption ?? "";

  const slides: Slide[] = (p.media ?? [])
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((m) => ({
      index: m.order,
      assetId: m.id,
      headline: "",
      body: "",
      layout: "cover" as const,
      ...(m.previewUrl ? { previewUrl: m.previewUrl } : {}),
      ...(m.width ? { width: m.width } : {}),
      ...(m.height ? { height: m.height } : {}),
    }));

  return {
    id: p.id,
    goalId: p.goalId ?? "",
    generationRunId: p.generationRunId ?? null,
    platforms: (p.intendedPlatforms ?? []).map((x) => x.toLowerCase() as Platform),
    slides,
    caption,
    hashtags: splitHashtags(caption),
    state: STATE_BY_STATUS[p.status] ?? "draft",
    scheduledFor: p.scheduledAt,
    publishedAt: p.publishedAt,
    // Recorded per run by the generation pipeline. A post composed by hand has
    // none of it, and still reports zeroes rather than invented numbers.
    usage: {
      inputTokens: p.inputTokens ?? 0,
      outputTokens: p.outputTokens ?? 0,
      estimatedCostInr: p.estimatedCostInr ?? 0,
      generationMs: p.generationMs ?? 0,
      modelId: p.modelId ?? "",
      runs: p.runCount ?? 0,
    },
    versions: [],
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

/**
 * The role enum and the optional key suffix are the only two fields that need
 * translating, but this lived inline in both the provider and the Accounts
 * view — so the two copies could drift apart.
 */
export function toRedsModel(m: ModelRecord): Model {
  return {
    id: m.id,
    label: m.label,
    provider: m.provider,
    apiModelId: m.apiModelId ?? undefined,
    role: (m.role ?? "BOTH").toLowerCase() as ModelRole,
    inputPricePerMTokInr: m.inputPricePerMTokInr,
    outputPricePerMTokInr: m.outputPricePerMTokInr,
    maxTokens: m.maxTokens,
    temperature: m.temperature,
    enabled: m.enabled,
    keyLast4: m.keyLast4 ?? undefined,
  };
}

/**
 * Reverse of `toRedsModel`, for the fields the Accounts view edits in place.
 *
 * `keyLast4` is deliberately absent: the suffix is derived server-side from a
 * full `key`, so sending it back would let the client dictate a value it has
 * no way to verify.
 */
export function toModelWirePatch(patch: Partial<Model>): UpdateModelBody {
  const out: UpdateModelBody = {};
  if (patch.label !== undefined) out.label = patch.label;
  if (patch.provider !== undefined) out.provider = patch.provider;
  if (patch.apiModelId !== undefined) out.apiModelId = patch.apiModelId ?? null;
  if (patch.role !== undefined) out.role = patch.role.toUpperCase() as ModelRoleWire;
  if (patch.inputPricePerMTokInr !== undefined) {
    out.inputPricePerMTokInr = patch.inputPricePerMTokInr;
  }
  if (patch.outputPricePerMTokInr !== undefined) {
    out.outputPricePerMTokInr = patch.outputPricePerMTokInr;
  }
  if (patch.maxTokens !== undefined) out.maxTokens = patch.maxTokens;
  if (patch.temperature !== undefined) out.temperature = patch.temperature;
  if (patch.enabled !== undefined) out.enabled = patch.enabled;
  return out;
}
