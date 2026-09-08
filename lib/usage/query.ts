/**
 * Reading the ledger, once, for whoever asks.
 *
 * The server-side half of the aggregation layer: `/api/usage` is a thin HTTP
 * wrapper over this, and nothing else queries `UsageEvent` directly. Keeping
 * the query here rather than in the route means the same numbers are available
 * to anything server-side that needs them without going back out over HTTP.
 */

import { prisma } from "@/lib/db";
import { aggregateUsage, type UsageRow, type UsageSummary } from "./aggregate";

export type UsageWindow = {
  userId: string;
  /** Inclusive. Omitted means from the beginning -- the all-time figure. */
  from?: Date | null;
  /** Exclusive. Omitted means up to now. */
  to?: Date | null;
  goalId?: string | null;
  postId?: string | null;
  generationRunId?: string | null;
};

export type UsageReport = {
  /** The window asked for, echoed back so a caller can label its own figures. */
  window: { from: string | null; to: string | null };
  period: UsageSummary;
  /** Every event for this user, ignoring the window. */
  allTime: UsageSummary;
};

const SELECT = {
  kind: true,
  status: true,
  apiModelId: true,
  provider: true,
  goalId: true,
  postId: true,
  modelId: true,
  inputTokens: true,
  outputTokens: true,
  imageCount: true,
  costInr: true,
  latencyMs: true,
  isBackfilled: true,
  createdAt: true,
} as const;

/**
 * The period and the all-time totals, from one pass over the user's events.
 *
 * Both are returned together because the dashboard shows them side by side and
 * they must never be fetched from different moments -- "this month" larger than
 * "all time" is the kind of contradiction that destroys trust in a dashboard.
 *
 * `createdAt` is the axis throughout: it is when the tokens were spent.
 * `scheduledFor` belongs to publishing and has no place in accounting.
 */
export async function getUsageReport(w: UsageWindow): Promise<UsageReport> {
  const scope = {
    userId: w.userId,
    ...(w.goalId ? { goalId: w.goalId } : {}),
    ...(w.postId ? { postId: w.postId } : {}),
    ...(w.generationRunId ? { generationRunId: w.generationRunId } : {}),
  };

  const [rows, goals] = await Promise.all([
    prisma.usageEvent.findMany({ where: scope, select: SELECT, orderBy: { createdAt: "asc" } }),
    prisma.goal.findMany({ where: { userId: w.userId }, select: { id: true, name: true } }),
  ]);

  const labels = { goal: Object.fromEntries(goals.map((g) => [g.id, g.name])) };

  const inWindow = (r: { createdAt: Date }) =>
    (!w.from || r.createdAt >= w.from) && (!w.to || r.createdAt < w.to);

  return {
    window: { from: w.from?.toISOString() ?? null, to: w.to?.toISOString() ?? null },
    period: aggregateUsage((rows as UsageRow[]).filter(inWindow), labels),
    allTime: aggregateUsage(rows as UsageRow[], labels),
  };
}
