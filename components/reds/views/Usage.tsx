"use client";

import { useEffect, useState } from "react";
import { PILL } from "@/lib/reds/data";
import { DAY, MONO, absDT, inr, inrCost, iso, num } from "@/lib/reds/format";
import { usageAt } from "@/lib/reds/usage-period";
import { chip, seg, useReds } from "../store";
import { Figures } from "../charts";
import type { Post } from "@/lib/reds/types";
import type { UsageReport } from "@/lib/usage/query";

const PERIODS = [
  { k: "month", label: "This month" },
  { k: "last", label: "Last month" },
  { k: "90", label: "Last 90 days" },
  { k: "custom", label: "Custom" },
];

interface GroupRow {
  label: string;
  calls: number;
  inTok: number;
  outTok: number;
  tokens: number;
  failed: number;
  /** Null when nothing in the bucket carries a price. */
  spend: number | null;
}

const H2: React.CSSProperties = { margin: "0 0 14px", fontSize: 20, fontWeight: 600, lineHeight: 1.35 };

export function Usage() {
  const s = useReds();
  if (s.now == null) return null;
  return <UsageInner now={s.now} />;
}

function UsageInner({ now }: { now: number }) {
  const s = useReds();
  const nowDate = new Date(now);
  const [period, setPeriod] = useState("month");
  const [uSort, setUSort] = useState<Record<string, { col: string; dir: "asc" | "desc" }>>({});
  const [runOpen, setRunOpen] = useState<Record<string, boolean>>({});
  const [thresholds, setThresholds] = useState<number[]>([80, 100]);

  // Consumption is dated by when the run happened, not by when the post is
  // meant to go out -- see `usageAt`. Reading `scheduledFor` here filtered out
  // every generated post, because generation leaves drafts unscheduled.
  /**
   * The ledger for the selected period.
   *
   * `/usage` is the one surface with its own period control, so it queries the
   * same aggregation layer with its own window rather than reusing the store's
   * month. That is a different question being asked, not the duplicated
   * arithmetic this refactor removed -- the totals still come from
   * `lib/usage/aggregate.ts`, never from summing posts here.
   */
  const [report, setReport] = useState<UsageReport | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    const n = new Date(now);

    const from =
      period === "month"
        ? new Date(n.getFullYear(), n.getMonth(), 1)
        : period === "last"
          ? new Date(n.getFullYear(), n.getMonth() - 1, 1)
          : new Date(now - 90 * DAY);
    const to = period === "last" ? new Date(n.getFullYear(), n.getMonth(), 1) : null;

    const qs = new URLSearchParams({ from: from.toISOString() });
    if (to) qs.set("to", to.toISOString());

    fetch(`/api/usage?${qs}`, { signal: ac.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.period) setReport(data as UsageReport);
      })
      .catch(() => {
        /* figures stay blank rather than wrong */
      });

    return () => ac.abort();
  }, [period, now]);

  const led = report?.period;

  const inPeriod = (p: Post) => {
    const d = usageAt(p);
    if (period === "month") return d.getMonth() === nowDate.getMonth() && d.getFullYear() === nowDate.getFullYear();
    if (period === "last") return d.getMonth() === (nowDate.getMonth() + 11) % 12;
    return d >= new Date(now - 90 * DAY) && d <= nowDate;
  };

  const list = s.posts.filter(inPeriod);
  // Consumption from the ledger; generation time is still a property of the
  // posts, which is where it is measured.
  const tokens = led?.totals.tokens ?? 0;
  const spend = led?.totals.costInr ?? null;
  const genMs = list.reduce((a, p) => a + p.usage.generationMs, 0);
  const money = (v: number | null | undefined) => (v == null ? "not priced" : "est. " + inrCost(v));

  // ---- burn chart ----
  // Bucketed from the ledger's own days, so the bars include image calls the
  // post columns never carried.
  const days = period === "90" ? 90 : 30;
  const bucketDays = Math.ceil(days / 30);
  const ledgerByDay = new Map((led?.byDay ?? []).map((b) => [b.day, b]));
  const buckets: { from: Date; t: number; c: number }[] = [];
  for (let i = 0; i < 30; i++) {
    const from = new Date(now - (30 - i) * bucketDays * DAY);
    const to = new Date(from.getTime() + bucketDays * DAY);
    let t = 0;
    let c = 0;
    for (const [day, b] of ledgerByDay) {
      const d = new Date(day + "T00:00:00.000Z");
      if (d >= from && d < to) {
        t += b.tokens;
        c += b.costInr ?? 0;
      }
    }
    buckets.push({ from, t, c });
  }
  const peakT = Math.max(1, ...buckets.map((b) => b.t));
  const peakC = Math.max(1, ...buckets.map((b) => b.c));

  // ---- breakdown tables ----
  // Straight from the aggregation layer's buckets: no grouping arithmetic
  // happens in this component any more.
  const toRows = (buckets2: { label: string; calls: number; ok: number; failed: number; inputTokens: number; outputTokens: number; tokens: number; costInr: number | null }[]): GroupRow[] =>
    buckets2.map((b) => ({
      label: b.label,
      calls: b.calls,
      inTok: b.inputTokens,
      outTok: b.outputTokens,
      tokens: b.tokens,
      failed: b.failed,
      spend: b.costInr,
    }));

  const sortBy = (rows: GroupRow[], key: string) => {
    const cur = uSort[key] || { col: "spend", dir: "desc" as const };
    return rows.slice().sort((a, b) => {
      const x = a[cur.col as keyof GroupRow];
      const y = b[cur.col as keyof GroupRow];
      if (typeof x === "string" && typeof y === "string") {
        return cur.dir === "asc" ? x.localeCompare(y) : y.localeCompare(x);
      }
      return cur.dir === "asc" ? Number(x) - Number(y) : Number(y) - Number(x);
    });
  };

  const mkTable = (key: string, title: string, rows: GroupRow[], firstLabel: string) => {
    const defs: { k: keyof GroupRow; label: string; align: "left" | "right" }[] = [
      { k: "label", label: firstLabel, align: "left" },
      { k: "calls", label: "Calls", align: "right" },
      { k: "inTok", label: "Tokens in", align: "right" },
      { k: "outTok", label: "Tokens out", align: "right" },
      { k: "tokens", label: "Tokens", align: "right" },
      { k: "failed", label: "Failed", align: "right" },
      { k: "spend", label: "Est. spend", align: "right" },
    ];
    const cur = uSort[key] || { col: "spend", dir: "desc" as const };
    return { key, title, defs, cur, rows: sortBy(rows, key) };
  };

  const breakdowns = [
    mkTable("byModel", "By model", toRows(led?.byModel ?? []), "Model"),
    mkTable("byGoal", "By goal", toRows(led?.byGoal ?? []), "Goal"),
    mkTable("byProvider", "By provider", toRows(led?.byProvider ?? []), "Provider"),
    mkTable(
      "byKind",
      "By operation",
      toRows([
        ...(led ? [{ label: "Caption", ...led.byKind.caption }] : []),
        ...(led ? [{ label: "Image", ...led.byKind.image }] : []),
      ]),
      "Operation",
    ),
  ];

  // ---- budget ----
  // Same source as the shell footer and the dashboard, so the three agree.
  const used = report?.period.totals.tokens ?? 0;
  const pct = Math.min(100, Math.round((used / s.budgetCap) * 100));
  const budgetFill = pct >= 100 ? "var(--red)" : pct >= 80 ? "var(--amber)" : "var(--green)";
  // The cost half was still summing the posts' own columns, which is how this
  // line came to read Rs 364 while every other figure on the page read Rs 3.
  const budgetLabel = `${num(used)} of ${num(s.budgetCap)} — ${money(spend)}`;

  // ---- recent runs ----
  const runs: { p: Post; v: Post["versions"][number] }[] = [];
  s.posts.forEach((p) => p.versions.forEach((v) => runs.push({ p, v })));
  runs.sort((a, b) => +new Date(b.v.createdAt) - +new Date(a.v.createdAt));

  const RUN_HEADERS: { label: string; align: "left" | "right" }[] = [
    { label: "When", align: "left" }, { label: "Post", align: "left" }, { label: "Scope", align: "left" },
    { label: "Model", align: "left" }, { label: "Tokens", align: "right" }, { label: "Est. cost", align: "right" },
    { label: "Duration", align: "right" }, { label: "Outcome", align: "left" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 38 }}>
      {/* ---- period + figures ---- */}
      <section>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, paddingBottom: 16, borderBottom: "1px solid var(--border-strong)" }}>
          <div role="group" aria-label="Period" style={{ display: "flex", gap: 2, padding: 2, border: "1px solid var(--border)", borderRadius: "var(--r3)", background: "var(--surface2)" }}>
            {PERIODS.map((p) => {
              const on = period === p.k;
              const c = seg(on);
              return (
                <button key={p.k} type="button" aria-pressed={on} onClick={() => setPeriod(p.k)} style={{ border: 0, borderRadius: "var(--r2)", padding: "4px 11px", fontSize: 12, background: c.bg, color: c.fg }}>
                  {p.label}
                </button>
              );
            })}
          </div>
          <span style={{ fontSize: 12, color: "var(--fg2)" }}>
            {list.length} posts in period · every figure is an estimate computed from the pricing table in Accounts
          </span>
        </div>
        <Figures
          figures={[
            { value: num(tokens), label: "tokens used" },
            { value: money(spend), label: "est. spend" },
            { value: String(led?.totals.ok ?? 0), label: "successful calls" },
            { value: String(led?.totals.failed ?? 0), label: "failed calls" },
            { value: (genMs / 60000).toFixed(1) + "m", label: "generation time" },
            { value: String(list.length), label: "posts generated" },
          ]}
        />
        <p style={{ margin: "16px 0 0", fontSize: 13, color: "var(--fg2)" }}>
          {led?.totals.calls
            ? `${num(tokens)} tokens over ${led.totals.calls} call${led.totals.calls === 1 ? "" : "s"}` +
              (spend == null ? " — none of it priced yet." : `, ${money(spend)} in total.`) +
              (led.totals.unpricedCalls
                ? ` ${led.totals.unpricedCalls} call${led.totals.unpricedCalls === 1 ? "" : "s"} not priced.`
                : "")
            : "No AI calls in this period."}
        </p>
      </section>

      {/* ---- burn ---- */}
      <section>
        <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 600, lineHeight: 1.35 }}>Burn</h2>
        <p style={{ margin: "0 0 18px", fontSize: 12, color: "var(--fg2)" }}>
          Bars are tokens. Dots are est. spend against the right axis.
        </p>
        <div style={{ display: "flex", gap: 12, alignItems: "stretch" }}>
          <div style={{ flex: "1 1 auto", minWidth: 0, position: "relative", height: 190, borderBottom: "1px solid var(--border)", borderLeft: "1px solid var(--border)" }}>
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", gap: 3, padding: "0 2px" }}>
              {buckets.map((b, i) => {
                const h = Math.round((b.t / peakT) * 100) + "%";
                const label = b.t === peakT ? num(b.t) : i === buckets.length - 1 ? "today" : "";
                return (
                  <span
                    key={i}
                    title={`${absDT(iso(b.from)).split(",")[0]} — ${num(b.t)} tokens, est. ${inr(b.c)}`}
                    style={{ position: "relative", flex: "1 1 0", height: "100%", display: "flex", alignItems: "flex-end" }}
                  >
                    <span style={{ width: "100%", height: h, minHeight: 2, borderRadius: "1px 1px 0 0", background: b.t === peakT ? "var(--green)" : "var(--green-tint2)" }} />
                    <span aria-hidden style={{ position: "absolute", left: "50%", bottom: Math.round((b.c / peakC) * 92) + "%", width: 4, height: 4, marginLeft: -2, borderRadius: "50%", background: "var(--fg2)" }} />
                    {label ? (
                      <span style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", bottom: `calc(${h} + 6px)`, whiteSpace: "nowrap", fontSize: 11, color: "var(--fg2)", fontFamily: MONO }}>
                        {label}
                      </span>
                    ) : null}
                  </span>
                );
              })}
            </div>
          </div>
          <div style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", justifyContent: "space-between", fontSize: 11, color: "var(--fg3)", fontFamily: MONO }}>
            <span>est. {inr(peakC)}</span>
            <span>est. {inr(peakC / 2)}</span>
            <span>₹0</span>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--fg3)", marginTop: 8 }}>
          <span>{absDT(iso(buckets[0].from)).split(",")[0]}</span>
          <span>{absDT(iso(now)).split(",")[0]}</span>
        </div>
      </section>

      {/* ---- breakdowns ---- */}
      <section>
        <h2 style={H2}>Breakdowns</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          {breakdowns.map((b) => (
            <div key={b.key}>
              <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 600 }}>{b.title}</h3>
              <div style={{ overflowX: "auto", borderTop: "1px solid var(--border-strong)" }}>
                <table style={{ width: "100%", minWidth: 760, fontSize: 13 }}>
                  <thead>
                    <tr>
                      {b.defs.map((h) => {
                        const on = b.cur.col === h.k;
                        return (
                          <th
                            key={h.k}
                            scope="col"
                            aria-sort={on ? (b.cur.dir === "asc" ? "ascending" : "descending") : "none"}
                            style={{ padding: 0, borderBottom: "1px solid var(--border)", textAlign: h.align, whiteSpace: "nowrap" }}
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setUSort((x) => ({
                                  ...x,
                                  [b.key]: { col: h.k, dir: on && b.cur.dir === "desc" ? "asc" : "desc" },
                                }))
                              }
                              style={{ display: "flex", alignItems: "center", gap: 5, width: "100%", justifyContent: h.align === "right" ? "flex-end" : "flex-start", border: 0, background: "transparent", padding: "7px 10px", fontSize: 12, fontWeight: 500, color: on ? "var(--green-text)" : "var(--fg2)" }}
                            >
                              {h.label}
                              <span aria-hidden style={{ fontSize: 10, color: "var(--green-text)" }}>
                                {on ? (b.cur.dir === "asc" ? "▲" : "▼") : ""}
                              </span>
                            </button>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r) => {
                      const cells = [
                        { v: r.label, align: "left" as const, fg: "var(--fg)", font: "inherit", size: 13 },
                        { v: String(r.calls), align: "right" as const, fg: "var(--fg2)", font: MONO, size: 12 },
                        { v: num(r.inTok), align: "right" as const, fg: "var(--fg2)", font: MONO, size: 12 },
                        { v: num(r.outTok), align: "right" as const, fg: "var(--fg2)", font: MONO, size: 12 },
                        { v: num(r.tokens), align: "right" as const, fg: "var(--fg)", font: MONO, size: 12 },
                        // Only coloured when there are failures to notice.
                        { v: String(r.failed), align: "right" as const, fg: r.failed ? "var(--red)" : "var(--fg3)", font: MONO, size: 12 },
                        { v: money(r.spend), align: "right" as const, fg: "var(--fg)", font: MONO, size: 12 },
                      ];
                      return (
                        <tr key={r.label} style={{ borderBottom: "1px solid var(--border)" }}>
                          {cells.map((c, i) => (
                            <td key={i} style={{ padding: "7px 10px", textAlign: c.align, color: c.fg, fontFamily: c.font, fontSize: c.size, whiteSpace: "nowrap" }}>
                              {c.v}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---- budget ---- */}
      <section>
        <h2 style={H2}>Budget</h2>
        <div style={{ maxWidth: 640, display: "flex", flexDirection: "column", gap: 14 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "var(--fg2)", maxWidth: 220 }}>
            Monthly token cap
            <input
              type="number"
              value={s.budgetCap}
              step={100000}
              onChange={(e) => s.setBudgetCap(Math.max(100000, Number(e.target.value) || 100000))}
              style={{ padding: "8px 10px", border: "1px solid var(--border)", borderRadius: "var(--r3)", background: "var(--surface)", fontFamily: MONO, fontSize: 13 }}
            />
          </label>
          <div>
            <div role="meter" aria-label="Monthly budget used" aria-valuenow={pct} style={{ height: 6, borderRadius: 3, background: "var(--sunken)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: pct + "%", background: budgetFill }} />
            </div>
            <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--fg2)" }}>
              {budgetLabel}
              {spend == null
                ? " — nothing priced yet, so no projection"
                : ` — projected month-end est. ${inr((spend / Math.max(1, nowDate.getDate())) * 30)} at the current run rate`}
            </p>
          </div>
          <div>
            <span style={{ display: "block", fontSize: 12, color: "var(--fg2)", marginBottom: 6 }}>Alert me at</span>
            <div style={{ display: "flex", gap: 8 }}>
              {[80, 100].map((t) => {
                const on = thresholds.includes(t);
                const c = chip(on);
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setThresholds((x) => (on ? x.filter((y) => y !== t) : [...x, t]))}
                    style={{ padding: "5px 11px", border: `1px solid ${c.br}`, borderRadius: "var(--r3)", background: c.bg, color: c.fg, fontSize: 12 }}
                  >
                    at {t}%
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ---- recent runs ---- */}
      <section>
        <h2 style={H2}>Recent runs</h2>
        <div style={{ overflowX: "auto", borderTop: "1px solid var(--border-strong)" }}>
          <table style={{ width: "100%", minWidth: 860, fontSize: 13 }}>
            <thead>
              <tr>
                {RUN_HEADERS.map((h) => (
                  <th key={h.label} scope="col" style={{ padding: "7px 10px", borderBottom: "1px solid var(--border)", textAlign: h.align, fontSize: 12, fontWeight: 500, color: "var(--fg2)", whiteSpace: "nowrap" }}>
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            {runs.slice(0, 14).map(({ p, v }) => {
              const failed = p.state === "failed" && v === p.versions[p.versions.length - 1];
              const pill = failed ? PILL.r : PILL.gs;
              const key = p.id + v.id;
              const open = !!runOpen[key];
              return (
                <tbody key={key}>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "7px 10px", color: "var(--fg2)", fontSize: 12, whiteSpace: "nowrap" }}>{absDT(v.createdAt)}</td>
                    <td style={{ padding: "7px 10px" }}>
                      <button type="button" onClick={() => s.go(`/posts/${p.id}`)} style={{ border: 0, background: "transparent", padding: 0, fontFamily: MONO, fontSize: 12, color: "var(--green-text)" }}>
                        {p.id}
                      </button>
                    </td>
                    <td style={{ padding: "7px 10px", color: "var(--fg2)" }}>{v.scope}</td>
                    <td style={{ padding: "7px 10px", color: "var(--fg2)" }}>{s.modelById(v.modelId || p.usage.modelId)?.label}</td>
                    <td style={{ padding: "7px 10px", textAlign: "right", fontFamily: MONO, fontSize: 12 }}>{num(v.tokens)}</td>
                    <td style={{ padding: "7px 10px", textAlign: "right", fontFamily: MONO, fontSize: 12, whiteSpace: "nowrap" }}>est. {inr(v.cost)}</td>
                    <td style={{ padding: "7px 10px", textAlign: "right", fontFamily: MONO, fontSize: 12, color: "var(--fg2)" }}>
                      {(p.usage.generationMs / p.versions.length / 1000).toFixed(1)}s
                    </td>
                    <td style={{ padding: "7px 10px" }}>
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => setRunOpen((x) => ({ ...x, [key]: !x[key] }))}
                        style={{ border: `1px solid ${pill.br}`, borderRadius: 999, background: pill.bg, color: pill.fg, fontSize: 11, padding: "2px 8px" }}
                      >
                        {failed ? "Failed" : "Completed"}
                      </button>
                    </td>
                  </tr>
                  {open ? (
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      <td colSpan={8} style={{ padding: 10, background: "var(--red-bg)" }}>
                        <p style={{ margin: 0, fontSize: 12, color: "var(--red)", fontFamily: MONO }}>
                          {failed ? "The run did not return usable JSON. No raw response was captured." : ""}
                        </p>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              );
            })}
          </table>
        </div>
      </section>
    </div>
  );
}
