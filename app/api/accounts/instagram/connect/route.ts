/**
 * GET /api/accounts/instagram/connect — start the Instagram connection.
 *
 * A route rather than a client-side `fetch` because Meta's consent dialog has
 * to be a top-level navigation: it is a page a person reads and presses a
 * button on, and a `fetch` would be blocked by CORS and could not show it
 * anyway. So the UI links here with a plain anchor and this answers with a
 * redirect.
 *
 * The state cookie is set on this very response, which is why `issueState`
 * takes the response rather than reaching for `cookies()` — see
 * `lib/oauth-state.ts`.
 */

import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { canEncryptSecrets } from "@/lib/crypto";
import { InstagramApiError, authorizeUrl, instagramConfig } from "@/lib/instagram";
import { newState, setStateCookie } from "@/lib/oauth-state";

/** Where a refusal lands, with a reason the Accounts page can render. */
function back(req: Request, reason: string): NextResponse {
  const url = new URL("/accounts", req.url);
  url.searchParams.set("connect", reason);
  return NextResponse.redirect(url);
}

export async function GET(req: Request) {
  // Identity is established before the round trip, so the callback can attach
  // the account to a user that definitely exists.
  await getCurrentUserId();

  // Checked here rather than in the callback. Without a key the token cannot be
  // stored, and finding that out *after* sending someone through Meta's consent
  // screen wastes the trip and looks like the grant itself failed.
  if (!canEncryptSecrets()) return back(req, "no-encryption-key");

  try {
    const state = newState();
    const redirect = NextResponse.redirect(authorizeUrl(state, instagramConfig()));
    setStateCookie("instagram", state, redirect);
    return redirect;
  } catch (err) {
    // A missing credential is a setup gap, not a server fault: the page names
    // which variable, rather than showing a 500.
    if (err instanceof InstagramApiError) return back(req, "not-configured");
    throw err;
  }
}
