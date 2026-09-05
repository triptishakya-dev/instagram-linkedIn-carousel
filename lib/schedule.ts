import { prisma } from "./db";

/**
 * Nothing may be scheduled inside this buffer of a token's expiry: a post that
 * fires after the grant dies just fails, and LinkedIn member grants have no
 * refresh token to recover with.
 */
export const TOKEN_EXPIRY_BUFFER_MS = 2 * 24 * 60 * 60 * 1000;

/** Publishing needs a few moments of runway, so "now" is not a valid slot. */
export const MIN_LEAD_TIME_MS = 60 * 1000;

/**
 * Latest instant this user can schedule for: the earliest still-valid grant's
 * expiry minus the buffer. `null` when nothing expires — which is also the case
 * when no account is connected yet.
 */
export async function scheduleCeiling(userId: string): Promise<Date | null> {
  const earliest = await prisma.socialAccount.findFirst({
    where: { userId, isValid: true, tokenExpiresAt: { not: null } },
    orderBy: { tokenExpiresAt: "asc" },
    select: { tokenExpiresAt: true },
  });

  if (!earliest?.tokenExpiresAt) return null;
  return new Date(earliest.tokenExpiresAt.getTime() - TOKEN_EXPIRY_BUFFER_MS);
}

export type ScheduleWindowResult =
  | { ok: true }
  | { ok: false; reason: "TOO_SOON" | "PAST_CEILING"; message: string };

export function checkScheduleWindow(
  scheduledAt: Date,
  ceiling: Date | null,
  now: Date = new Date(),
): ScheduleWindowResult {
  if (scheduledAt.getTime() < now.getTime() + MIN_LEAD_TIME_MS) {
    return {
      ok: false,
      reason: "TOO_SOON",
      message: "Pick a time at least a minute from now.",
    };
  }

  if (ceiling && scheduledAt.getTime() > ceiling.getTime()) {
    return {
      ok: false,
      reason: "PAST_CEILING",
      message: `Cannot schedule past ${ceiling.toISOString()} — that is the earliest token expiry minus a two-day buffer. Reconnect to schedule further out.`,
    };
  }

  return { ok: true };
}
