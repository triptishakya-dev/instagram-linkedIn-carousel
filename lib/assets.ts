import type { Asset } from "@prisma/client";

import { prisma } from "./db";
import { presignGet } from "./s3";

export type SerializedAsset = Omit<Asset, "storageKey"> & {
  storageKey: string;
  /** Short-lived signed GET; the bucket is private, so this is not stored. */
  previewUrl: string | null;
  /** Posts that would break if this asset were removed. */
  usedInPostIds: string[];
};

/**
 * Which posts depend on each asset.
 *
 * A post has no direct link to an asset — the goal that produced it holds the
 * references — so usage is resolved one hop out, through the goal. Built for
 * the whole page of assets in two queries rather than two per row.
 */
async function usageByAssetId(
  userId: string,
  assetIds: string[],
): Promise<Map<string, string[]>> {
  const usage = new Map<string, string[]>(assetIds.map((id) => [id, []]));
  if (assetIds.length === 0) return usage;

  const goals = await prisma.goal.findMany({
    where: { userId },
    select: {
      id: true,
      brandLogoAssetId: true,
      referenceAssetIds: true,
      imageAssetIds: true,
      posts: { select: { id: true } },
    },
  });

  for (const goal of goals) {
    const referenced = new Set(
      [goal.brandLogoAssetId, ...goal.referenceAssetIds, ...goal.imageAssetIds].filter(
        (id): id is string => !!id,
      ),
    );

    for (const assetId of referenced) {
      const bucket = usage.get(assetId);
      if (!bucket) continue;
      for (const post of goal.posts) {
        if (!bucket.includes(post.id)) bucket.push(post.id);
      }
    }
  }

  return usage;
}

/** Adds a signed preview URL and usage to each row, for the client. */
export async function serializeAssets(
  userId: string,
  assets: Asset[],
): Promise<SerializedAsset[]> {
  const usage = await usageByAssetId(
    userId,
    assets.map((a) => a.id),
  );

  return Promise.all(
    assets.map(async (asset) => ({
      ...asset,
      // A single unreadable object should not blank the whole library.
      previewUrl: await presignGet(asset.storageKey).catch(() => null),
      usedInPostIds: usage.get(asset.id) ?? [],
    })),
  );
}
