/**
 * POST /api/accounts/[id]/refresh — renew the token and re-read the profile.
 *
 * This does more than it could under Facebook Login, and the difference is the
 * point. That flow had no way to extend a long-lived user token, so this route
 * could only report on a grant's health. Instagram Login exposes
 * `ig_refresh_token`, so a connection checked inside its 60 days is pushed out
 * another 60 — a workspace whose accounts are touched now and then never has to
 * reauthorise at all.
 *
 * It also answers the two questions the Accounts page cannot otherwise answer
 * honestly:
 *
 *   - Is the grant still alive? `SocialAccount.isValid` defaults to true and,
 *     without this route, nothing ever set it to anything else — so a revoked
 *     connection went on rendering as healthy.
 *   - Is the profile still publishable? An account switched back to personal
 *     keeps a valid token and loses the ability to post.
 */

import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { SECRET_KEY_ID, decryptSecret, encryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { ApiError, toErrorResponse } from "@/lib/http";
import {
  InstagramApiError,
  canPublish,
  expiryFrom,
  fetchProfile,
  refreshLongLived,
} from "@/lib/instagram";

/** Marks a connection unusable, so the Accounts page stops calling it healthy. */
async function invalidate(id: string): Promise<void> {
  await prisma.socialAccount.update({
    where: { id },
    data: { isValid: false, lastSyncAt: new Date() },
  });
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const userId = await getCurrentUserId();

    const account = await prisma.socialAccount.findFirst({
      where: { id, userId },
      select: { id: true, platform: true, encryptedAccessToken: true },
    });

    if (!account) throw new ApiError(404, "NOT_FOUND", "Connected account not found.");

    if (account.platform !== "INSTAGRAM") {
      throw new ApiError(
        400,
        "BAD_REQUEST",
        `Refreshing a ${account.platform} connection is not implemented.`,
      );
    }

    // A token that will not decrypt — written under a since-rotated
    // TOKEN_ENCRYPTION_KEY — is unusable and unrecoverable, so the row is
    // marked invalid and the user is told to reconnect rather than shown a
    // decryption error.
    let stored: string;
    try {
      stored = decryptSecret(account.encryptedAccessToken);
    } catch {
      await invalidate(account.id);
      throw new ApiError(
        409,
        "CONFLICT",
        "This connection's stored token can no longer be read. Reconnect Instagram.",
      );
    }

    /**
     * Renewal is attempted but not required.
     *
     * Instagram refuses to refresh a token younger than 24 hours, and a
     * connection made this morning is in exactly that state — treating the
     * refusal as a failure would report a healthy new connection as broken. So
     * a failed renewal keeps the existing token and lets the profile read below
     * decide whether the grant is actually alive.
     */
    let token: string = stored;
    let renewedExpiry: Date | null = null;

    try {
      const renewed = await refreshLongLived(stored);
      token = renewed.accessToken;
      renewedExpiry = expiryFrom(renewed);
    } catch {
      /* keep the stored token; the profile read is the real health check */
    }

    let profile;
    try {
      profile = await fetchProfile(token);
    } catch (err) {
      if (err instanceof InstagramApiError) {
        // The point of the route: a grant Instagram rejects is recorded as
        // dead, so the page can say so before a scheduled post discovers it.
        await invalidate(account.id);
        throw new ApiError(409, "CONFLICT", `Instagram rejected this connection: ${err.message}`);
      }
      throw err;
    }

    if (!canPublish(profile)) {
      await invalidate(account.id);
      throw new ApiError(
        409,
        "CONFLICT",
        `@${profile.username ?? profile.id} is a personal account, which cannot publish. ` +
          "Switch it to Business or Creator in Instagram, then reconnect.",
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.socialAccount.update({
        where: { id: account.id },
        data: {
          isValid: true,
          lastSyncAt: new Date(),
          name: profile.name,
          username: profile.username,
          avatarUrl: profile.avatarUrl,
          // Only written when the renewal actually succeeded: recording an
          // unchanged expiry as if it had moved would hide a connection that is
          // quietly running out.
          ...(renewedExpiry
            ? {
                encryptedAccessToken: encryptSecret(token),
                tokenExpiresAt: renewedExpiry,
                keyId: SECRET_KEY_ID,
              }
            : {}),
        },
      });

      await tx.socialTarget.updateMany({
        where: { socialAccountId: account.id, platformTargetId: profile.id },
        data: {
          name: profile.name ?? profile.username ?? profile.id,
          username: profile.username,
          avatarUrl: profile.avatarUrl,
        },
      });
    });

    return NextResponse.json({
      success: true,
      /** Whether the 60-day window actually moved, which the toast reports. */
      renewed: renewedExpiry !== null,
      tokenExpiresAt: renewedExpiry?.toISOString() ?? null,
      username: profile.username,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
