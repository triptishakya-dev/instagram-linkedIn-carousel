/**
 * Pairing the posts a single generation run produced.
 *
 * Generation writes one `Post` per platform, so "what goes out to Instagram"
 * and "what goes out to LinkedIn" are two rows joined only by
 * `generationRunId`. The detail view needs both to answer that question, and
 * needs to know when one is simply absent so it can say so rather than imply
 * the run covered a platform it never touched.
 *
 * Kept out of the store so it can be tested without a DOM: which platform gets
 * a preview and which gets an empty state is decided entirely here.
 */

import type { Platform, Post } from "./types";

/**
 * The run's posts keyed by platform, from the whole list.
 *
 * A platform is absent from the result when the run produced nothing for it.
 * `post` itself always wins its own platform slot, so the row the URL names is
 * never displaced by another row claiming the same platform.
 */
export function runSiblings(post: Post, all: readonly Post[]): Partial<Record<Platform, Post>> {
  // A hand-composed post has no run to group by. It stands alone rather than
  // being grouped with every other post that also has no run id.
  const group = post.generationRunId
    ? all.filter((p) => p.generationRunId === post.generationRunId)
    : [post];

  const byPlatform: Partial<Record<Platform, Post>> = {};

  for (const p of group) {
    for (const platform of p.platforms) {
      if (!byPlatform[platform] || p.id === post.id) byPlatform[platform] = p;
    }
  }

  return byPlatform;
}
