import { z } from "zod";

/**
 * Ceiling for the free-text prompt fields on a goal and a post.
 *
 * The columns behind these are Postgres `text`, so nothing here is a storage
 * constraint — the cap exists only to keep a runaway paste from bloating a row.
 * A slide-by-slide layout brief runs long by nature, which is why this sits
 * well above the few thousand characters the fields were originally given.
 */
export const MAX_PROMPT_CHARS = 20_000;

/** Reads the same in the API response and in the editor's counter. */
export function promptTooLongMessage(label: string): string {
  return `${label} is over the ${MAX_PROMPT_CHARS.toLocaleString("en-US")} character limit. Trim it and save again.`;
}

/** An optional prompt field that explains itself when it is too long. */
export function promptField(label: string) {
  return z.string().max(MAX_PROMPT_CHARS, promptTooLongMessage(label)).nullish();
}
