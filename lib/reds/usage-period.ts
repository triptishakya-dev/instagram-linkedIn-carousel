/**
 * Which date a post's token and cost consumption belongs to.
 *
 * Two different dates hang off a post and they answer different questions:
 *
 *   scheduledFor -> when the content is meant to be published
 *   createdAt    -> when the generation actually ran, and the tokens were spent
 *
 * Usage accounting was reading `scheduledFor`, which is null for every
 * generated post -- generation drops drafts into the queue unscheduled. So the
 * usage page and the dashboard filtered every real post out and reported zero
 * while the shell footer, which never filtered by date, reported the true
 * total. Same data, two answers.
 *
 * Exported as one named function rather than repeated inline so the next
 * surface that needs it cannot pick the wrong field. Publishing and scheduling
 * analytics still use `scheduledFor`, correctly, and must not call this.
 */

import type { Post } from "./types";

/** The instant a post's usage is attributed to. */
export function usageAt(post: Post): Date {
  return new Date(post.createdAt);
}

/** Tokens a post consumed, input and output together. */
export function usageTokens(post: Post): number {
  return post.usage.inputTokens + post.usage.outputTokens;
}
