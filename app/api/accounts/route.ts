import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { toErrorResponse } from "@/lib/http";

/**
 * GET /api/accounts
 *
 * Connected social accounts and the destinations each one can post to.
 *
 * The encrypted token columns are never selected. A disconnect decision needs
 * to know *when* a grant dies, not what it is, so only `tokenExpiresAt` and
 * `isValid` cross the wire.
 */
export async function GET() {
  try {
    const userId = await getCurrentUserId();

    const accounts = await prisma.socialAccount.findMany({
      where: { userId },
      orderBy: [{ platform: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        platform: true,
        name: true,
        username: true,
        avatarUrl: true,
        isValid: true,
        tokenExpiresAt: true,
        lastSyncAt: true,
        createdAt: true,
        targets: {
          orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
          select: {
            id: true,
            platform: true,
            targetType: true,
            name: true,
            username: true,
            avatarUrl: true,
            isDefault: true,
          },
        },
      },
    });

    // How much a disconnect would cost, counted per account rather than left
    // for the client to work out from a full post list it does not have.
    const scheduled = await prisma.publishTarget.groupBy({
      by: ["socialTargetId"],
      where: {
        status: { in: ["PENDING", "PREPARING", "READY"] },
        post: { userId, status: "SCHEDULED" },
      },
      _count: { _all: true },
    });

    const countByTarget = new Map(scheduled.map((r) => [r.socialTargetId, r._count._all]));

    return NextResponse.json({
      accounts: accounts.map((a) => ({
        ...a,
        scheduledPostCount: a.targets.reduce(
          (sum, t) => sum + (countByTarget.get(t.id) ?? 0),
          0,
        ),
      })),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
