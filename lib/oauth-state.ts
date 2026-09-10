/**
 * The `state` parameter for an OAuth redirect, and the cookie that verifies it.
 *
 * Without it, anyone can send a browser to our callback with a `code` of their
 * choosing and have the resulting account attached to whoever's session
 * arrives. `state` closes that: a random value is put in a cookie *and* in the
 * URL handed to the provider, and the callback only proceeds when the value
 * coming back matches the one in the cookie.
 *
 * Shared rather than Instagram-specific, because `LINKEDIN_REDIRECT_URI` is
 * already in `.env` and that flow needs exactly this.
 */

import { randomBytes, timingSafeEqual } from "node:crypto";
import type { NextResponse } from "next/server";

/**
 * `sameSite: "lax"`, and this is the whole reason the constant exists.
 *
 * The callback is a top-level navigation that instagram.com sends the browser
 * on, which is cross-site. Under `"strict"` the browser withholds the cookie on
 * exactly that navigation, so the callback sees no stored state and rejects
 * every single connection — with the code, the config and the app all correct.
 * `"lax"` sends cookies on top-level cross-site GETs, which is this and nothing
 * more.
 */
const SAME_SITE = "lax" as const;

/** Ten minutes: long enough to read a consent screen, short enough to matter. */
export const STATE_TTL_SECONDS = 600;

/** One cookie per provider, so two connect flows cannot overwrite each other. */
export function stateCookieName(provider: string): string {
  return `oauth_state_${provider}`;
}

/** A fresh state value. Minted before the URL, which has to carry it. */
export function newState(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Attaches the state cookie to the redirect that sends the browser away.
 *
 * Set on that response and not through `cookies()`, because the cookie and the
 * redirect have to travel together: a `Set-Cookie` on any other response is not
 * yet in the browser by the time the provider sends it back.
 */
export function setStateCookie(
  provider: string,
  state: string,
  response: NextResponse,
): void {
  response.cookies.set({
    name: stateCookieName(provider),
    value: state,
    httpOnly: true,
    sameSite: SAME_SITE,
    // Only over HTTPS in production. Forced on in development it would never be
    // stored at all, since the dev server is plain http on localhost.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: STATE_TTL_SECONDS,
  });
}

/**
 * Whether the state coming back matches the one that was issued.
 *
 * Compared with `timingSafeEqual` over fixed-length buffers. The lengths are
 * checked first because `timingSafeEqual` throws rather than returning false on
 * a length mismatch, and a thrown error here would read as a server fault
 * rather than as the rejection it is.
 */
export function stateMatches(
  cookieValue: string | undefined,
  returned: string | null,
): boolean {
  if (!cookieValue || !returned) return false;

  const a = Buffer.from(cookieValue);
  const b = Buffer.from(returned);

  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Clears the state cookie once it has been used.
 *
 * Called on both outcomes. A state left in place after a successful connection
 * is a value that can be replayed, and one left after a failure makes the next
 * attempt's mismatch harder to reason about.
 */
export function clearState(provider: string, response: NextResponse): void {
  response.cookies.set({
    name: stateCookieName(provider),
    value: "",
    httpOnly: true,
    sameSite: SAME_SITE,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
