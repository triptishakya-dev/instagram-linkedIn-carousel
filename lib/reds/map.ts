/**
 * Translation between what the API stores and what the views render.
 *
 * The database speaks Prisma enums (`SCHEDULED`, `INSTAGRAM`, `IMAGE`); the
 * views were written against lowercase unions. Keeping the conversion in one
 * file means neither side has to know about the other's casing.
 */

import type { AssetRecord } from "../api-client";
import { TINTS } from "./data";
import type { Asset, AssetKind, Platform, Post, PostState, Slide } from "./types";

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

type ApiPostMedia = { id: string; order: number; url: string };

type ApiPost = {
  id: string;
  goalId: string | null;
  caption: string | null;
  status: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  intendedPlatforms: string[];
  media?: ApiPostMedia[];
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
    }));

  return {
    id: p.id,
    goalId: p.goalId ?? "",
    platforms: (p.intendedPlatforms ?? []).map((x) => x.toLowerCase() as Platform),
    slides,
    caption,
    hashtags: splitHashtags(caption),
    state: STATE_BY_STATUS[p.status] ?? "draft",
    scheduledFor: p.scheduledAt,
    publishedAt: p.publishedAt,
    // Generation accounting is not recorded yet; the columns render as zeroes
    // rather than invented numbers.
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostInr: 0,
      generationMs: 0,
      modelId: "",
      runs: 0,
    },
    versions: [],
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}
