import type { Post, SocialAccount, SocialTarget } from "./types";

/**
 * The UI's data layer. Nothing is seeded here — every collection starts empty
 * and gets filled once the Prisma-backed queries are wired in, so the screens
 * render the same empty states a brand-new account would see.
 */

/** Wall-clock now, as the ISO string the formatters expect. */
export function now(): string {
  return new Date().toISOString();
}

/** Default zone for rendering stored UTC instants until the user picks one. */
export const USER_TZ = "Asia/Kolkata";

/** One OAuth grant per provider. Empty until a provider is connected. */
export const accounts: SocialAccount[] = [];

/** Every publishable destination across all grants. */
export const socialTargets: SocialTarget[] = accounts.flatMap((a) => a.targets);

export function targetById(id: string): SocialTarget | undefined {
  return socialTargets.find((t) => t.id === id);
}

export function accountForTarget(id: string): SocialAccount | undefined {
  return accounts.find((a) => a.targets.some((t) => t.id === id));
}

export const posts: Post[] = [];

export function postById(id: string): Post | undefined {
  return posts.find((p) => p.id === id);
}

/**
 * Latest instant a post can be scheduled for: the earliest connected grant's
 * expiry, minus a two-day buffer. `null` when nothing expires — or when
 * nothing is connected yet.
 */
export function scheduleCeiling(): string | null {
  const expiries = accounts
    .map((a) => a.tokenExpiresAt)
    .filter((e): e is string => e !== null)
    .sort();
  if (expiries.length === 0) return null;
  const capped = new Date(new Date(expiries[0]).getTime() - 2 * 86400000);
  return capped.toISOString().slice(0, 10);
}
