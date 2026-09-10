/**
 * The Instagram OAuth callback, wherever it is mounted.
 *
 * The path is not a choice made here: whatever `INSTAGRAM_REDIRECT_URI` (or
 * `META_REDIRECT_URI`) is set to has to be registered with Meta character for
 * character, and Meta will only send the browser to a registered URI. So the
 * handler lives here and the route file that mounts it is one line, so moving
 * the callback is a directory rename plus a dashboard edit and nothing else.
 *
 * Every exit is a redirect to `/accounts?connect=<reason>` rather than a JSON
 * error. A person is looking at a browser tab at this point, not at a network
 * panel, and the Accounts page turns each reason into a sentence.
 *
 * The outcome worth designing for is `not-professional`: the login succeeded,
 * the token is good, and there is still nothing to publish to because the
 * account is personal rather than Business/Creator. It is the most common real
 * result and it is not an error, so it gets its own reason instead of being
 * flattened into "failed". No Facebook Page is involved in this flow, so a
 * missing Page is never the cause.
 */

import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { SECRET_KEY_ID, encryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import {
  InstagramApiError,
  canPublish,
  exchangeCode,
  exchangeForLongLived,
  expiryFrom,
  fetchProfile,
  instagramConfig,
} from "@/lib/instagram";
import { clearState, stateCookieName, stateMatches } from "@/lib/oauth-state";

const PROVIDER = "instagram";

/**
 * Redirects to the Accounts page with an outcome, clearing the state cookie.
 *
 * Cleared on success and failure alike: a state left in place is a value that
 * can be replayed, and one left after a failure makes the next attempt's
 * mismatch harder to reason about.
 */
function done(
  req: Request,
  reason: string,
  extra: Record<string, string> = {},
): NextResponse {
  const url = new URL("/accounts", req.url);
  url.searchParams.set("connect", reason);
  for (const [key, value] of Object.entries(extra)) url.searchParams.set(key, value);

  const redirect = NextResponse.redirect(url);
  clearState(PROVIDER, redirect);
  return redirect;
}

/**
 * One cookie off the request, split on its first `=` only.
 *
 * A cookie value may legally contain `=`, so splitting on every one of them and
 * taking index 1 would truncate the value it was meant to read.
 */
function readCookie(req: Request, name: string): string | undefined {
  for (const part of req.headers.get("cookie")?.split(";") ?? []) {
    const raw = part.trim();
    const eq = raw.indexOf("=");
    if (eq > 0 && raw.slice(0, eq) === name) return raw.slice(eq + 1);
  }
  return undefined;
}



export async function handleInstagramCallback(req: Request) {
  const url = new URL(req.url);
  const params = url.searchParams;

  // Meta reports a refusal in the query string, not as an HTTP error. Pressing
  // Cancel is a decision, so it is reported as one rather than as a failure.
  if (params.get("error")) {
    const denied = params.get("error_reason") === "user_denied";
    return done(req, denied ? "cancelled" : "denied", {
      ...(params.get("error_description")
        ? { detail: params.get("error_description") as string }
        : {}),
    });
  }

  const code = params.get("code");
  if (!code) return done(req, "no-code");

  // The state check, before anything is exchanged or written. A mismatch means
  // this callback was not started by this browser, and the `code` in it is not
  // ours to spend.
  const stored = readCookie(req, stateCookieName(PROVIDER));

  if (!stateMatches(stored, params.get("state"))) {
    return done(req, "state-mismatch");
  }

  try {
    const userId = await getCurrentUserId();
    const config = instagramConfig();

    // Short-lived first, then extended. The short-lived token lasts about an
    // hour, which would expire long before any scheduled post fired.
    const shortLived = await exchangeCode(code, config);
    const token = await exchangeForLongLived(shortLived.accessToken, config);

    // One login is one account: Instagram Login grants access to the account
    // that logged in, with no Page layer to fan out over. So the profile is
    // both the identity of the row and its single destination.
    const profile = await fetchProfile(token.accessToken, config);

    // A personal account can complete the login and still be unable to post.
    // Refused here rather than stored, because an account row that reads as
    // connected while failing every scheduled post is worse than no row.
    if (!canPublish(profile)) return done(req, "not-professional");

    await prisma.$transaction(async (tx) => {
      const account = await tx.socialAccount.upsert({
        // The unique key the schema already carries, so reconnecting the same
        // login updates one row rather than accumulating them.
        where: {
          userId_platform_platformUserId: {
            userId,
            platform: "INSTAGRAM",
            platformUserId: profile.id,
          },
        },
        create: {
          userId,
          platform: "INSTAGRAM",
          platformUserId: profile.id,
          name: profile.name,
          username: profile.username,
          avatarUrl: profile.avatarUrl,
          encryptedAccessToken: encryptSecret(token.accessToken),
          tokenExpiresAt: expiryFrom(token),
          keyId: SECRET_KEY_ID,
          isValid: true,
          lastSyncAt: new Date(),
        },
        update: {
          name: profile.name,
          username: profile.username,
          avatarUrl: profile.avatarUrl,
          encryptedAccessToken: encryptSecret(token.accessToken),
          tokenExpiresAt: expiryFrom(token),
          keyId: SECRET_KEY_ID,
          // A reconnect is how a dead grant is repaired, so it clears the flag
          // that marked it dead.
          isValid: true,
          lastSyncAt: new Date(),
        },
        select: { id: true },
      });

      // One destination, upserted rather than replaced. Under Facebook Login a
      // reconnect could legitimately change the whole set of destinations, so
      // the rows were deleted and rebuilt; here the account that logged in is
      // the only possible destination, so its `PublishTarget` history — and any
      // scheduled post pointing at it — has no reason to be cascaded away.
      await tx.socialTarget.upsert({
        where: {
          socialAccountId_platformTargetId: {
            socialAccountId: account.id,
            platformTargetId: profile.id,
          },
        },
        create: {
          socialAccountId: account.id,
          platform: "INSTAGRAM",
          targetType: "INSTAGRAM_PROFESSIONAL",
          platformTargetId: profile.id,
          name: profile.name ?? profile.username ?? profile.id,
          username: profile.username,
          avatarUrl: profile.avatarUrl,
          isDefault: true,
        },
        update: {
          name: profile.name ?? profile.username ?? profile.id,
          username: profile.username,
          avatarUrl: profile.avatarUrl,
          isDefault: true,
        },
      });

      // A row left over from a previous connection of a different account under
      // this same login. There can only be one destination now, so anything
      // else is stale.
      await tx.socialTarget.deleteMany({
        where: { socialAccountId: account.id, platformTargetId: { not: profile.id } },
      });
    });

    return done(req, "ok", { handle: profile.username ?? profile.id });
  } catch (err) {
    // Instagram's own sentence is worth showing: "this app is in development
    // mode", an unapproved permission, a redirect URI that does not match. A
    // generic failure would send someone reading this code instead of their app
    // setup.
    if (err instanceof InstagramApiError) {
      return done(req, "failed", { detail: err.message.slice(0, 300) });
    }
    console.error("[instagram callback] unhandled error:", err);
    return done(req, "failed");
  }
}
