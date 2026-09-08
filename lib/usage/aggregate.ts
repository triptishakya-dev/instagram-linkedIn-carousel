/**
 * Turning ledger rows into the figures the application shows.
 *
 * Pure, so it can be tested without a database, and the single place any usage
 * total is computed. Five surfaces render usage -- the dashboard, `/usage`,
 * Goals, the shell footer and the post card -- and before this they each
 * summed posts their own way, which is how the footer came to report 1,822
 * tokens while the usage page reported none.
 *
 * Cost is nullable throughout, and that is load-bearing. A call the provider
 * priced and a call nobody has priced are different facts, so `costInr` is
 * summed only over the rows that have one and `unpricedCalls` reports the
 * rest. A total that silently absorbed unpriced image calls as zero would read
 * as authoritative while understating the bill by the whole image spend.
 */

export type UsageRow = {
  kind: "CAPTION" | "IMAGE";
  status: "OK" | "FAILED";
  apiModelId: string;
  provider: string;
  goalId: string | null;
  postId: string | null;
  modelId: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  imageCount: number | null;
  costInr: number | null;
  latencyMs: number | null;
  isBackfilled: boolean;
  createdAt: Date;
};

export type UsageTotals = {
  calls: number;
  ok: number;
  failed: number;
  inputTokens: number;
  outputTokens: number;
  tokens: number;
  images: number;
  /** Null when nothing in the set carries a price. */
  costInr: number | null;
  /** Calls with no price attached, so a total is never mistaken for complete. */
  unpricedCalls: number;
  /** Rows reconstructed from history rather than observed at call time. */
  backfilledCalls: number;
};

export type UsageBucket = UsageTotals & { key: string; label: string };

export type UsageSummary = {
  totals: UsageTotals;
  byKind: { caption: UsageTotals; image: UsageTotals };
  byModel: UsageBucket[];
  byGoal: UsageBucket[];
  byProvider: UsageBucket[];
  byDay: (UsageTotals & { day: string })[];
};

function empty(): UsageTotals {
  return {
    calls: 0,
    ok: 0,
    failed: 0,
    inputTokens: 0,
    outputTokens: 0,
    tokens: 0,
    images: 0,
    costInr: null,
    unpricedCalls: 0,
    backfilledCalls: 0,
  };
}

function add(t: UsageTotals, r: UsageRow): UsageTotals {
  const input = r.inputTokens ?? 0;
  const output = r.outputTokens ?? 0;

  return {
    calls: t.calls + 1,
    ok: t.ok + (r.status === "OK" ? 1 : 0),
    failed: t.failed + (r.status === "FAILED" ? 1 : 0),
    inputTokens: t.inputTokens + input,
    outputTokens: t.outputTokens + output,
    tokens: t.tokens + input + output,
    images: t.images + (r.imageCount ?? 0),
    // Null plus a number is that number; null plus null stays null. Only a set
    // with nothing priced in it reports "no cost known".
    costInr:
      r.costInr == null
        ? t.costInr
        : Math.round(((t.costInr ?? 0) + r.costInr) * 100) / 100,
    unpricedCalls: t.unpricedCalls + (r.costInr == null ? 1 : 0),
    backfilledCalls: t.backfilledCalls + (r.isBackfilled ? 1 : 0),
  };
}

/** `YYYY-MM-DD` in UTC, so a bucket key never shifts with the reader's zone. */
function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function bucket(
  rows: readonly UsageRow[],
  keyOf: (r: UsageRow) => string | null,
  labelOf: (key: string) => string,
): UsageBucket[] {
  const map = new Map<string, UsageTotals>();

  for (const r of rows) {
    const key = keyOf(r);
    if (key == null) continue;
    map.set(key, add(map.get(key) ?? empty(), r));
  }

  return [...map.entries()]
    .map(([key, t]) => ({ key, label: labelOf(key), ...t }))
    // Most spend first, and calls as the tie-break so an all-unpriced list
    // still orders by something meaningful rather than arbitrarily.
    .sort((a, b) => (b.costInr ?? 0) - (a.costInr ?? 0) || b.calls - a.calls);
}

export function aggregateUsage(
  rows: readonly UsageRow[],
  labels: { goal?: Record<string, string> } = {},
): UsageSummary {
  const totals = rows.reduce(add, empty());

  const byDayMap = new Map<string, UsageTotals>();
  for (const r of rows) {
    const k = dayKey(r.createdAt);
    byDayMap.set(k, add(byDayMap.get(k) ?? empty(), r));
  }

  return {
    totals,
    byKind: {
      caption: rows.filter((r) => r.kind === "CAPTION").reduce(add, empty()),
      image: rows.filter((r) => r.kind === "IMAGE").reduce(add, empty()),
    },
    byModel: bucket(rows, (r) => r.apiModelId, (k) => k),
    byGoal: bucket(rows, (r) => r.goalId, (k) => labels.goal?.[k] ?? k),
    byProvider: bucket(rows, (r) => r.provider, (k) => k),
    byDay: [...byDayMap.entries()]
      .map(([day, t]) => ({ day, ...t }))
      .sort((a, b) => a.day.localeCompare(b.day)),
  };
}
