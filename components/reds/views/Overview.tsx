"use client";

import { useMemo } from "react";
import { PILL, STATES } from "@/lib/reds/data";
import { DAY, DOW, MON, MONO, absDT, inr, iso, num, relDT, sameDay } from "@/lib/reds/format";
import { Chart, EmptyState, Figures, Pill, SectionHead, type ChartSpec } from "../charts";
import { useReds } from "../store";

export function Overview() {
  const s = useReds();
  if (s.now == null) return null;
  return <OverviewInner now={s.now} />;
}

function OverviewInner({ now }: { now: number }) {
  const s = useReds();

  const needs = s.posts
    .filter((p) => p.state === "ready" || p.state === "failed")
    .slice(0, 6)
    .map((p) => {
      const st = STATES[p.state];
      const pill = PILL[st.t];
      return {
        id: p.id,
        headline: p.slides[0]?.headline ?? p.id,
        stateLabel: st.l,
        pill,
        sub:
          (s.goalById(p.goalId)?.name ?? "No goal") +
          " — " +
          (p.state === "failed"
            ? "run " + p.usage.runs + " returned invalid JSON"
            : "scheduled " + absDT(p.scheduledFor) + " " + relDT(p.scheduledFor, now)),
        thumbs: p.slides.slice(0, 3).map((sl) => ({ tint: s.assetById(sl.assetId)?.tint || "var(--n200)" })),
        primaryLabel: p.state === "failed" ? "Retry" : "Approve",
        primary: () => {
          s.patchPost(p.id, { state: p.state === "failed" ? "queued" : "scheduled" });
          s.toast(p.state === "failed" ? "Run queued" : "Post approved");
        },
      };
    });

  // Counts describe the rows on screen, not the whole workspace.
  const failedCount = needs.filter((n) => n.stateLabel === "Failed").length;
  const needsSummary = `${failedCount} failed, ${needs.length - failedCount} awaiting review`;

  const week = useMemo(() => {
    const out = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(now + i * DAY);
      const chips = s.posts.filter((p) => p.scheduledFor && sameDay(new Date(p.scheduledFor), d));
      out.push({
        key: i,
        dow: DOW[d.getDay()],
        day: String(d.getDate()),
        bg: i === 0 ? "var(--surface2)" : "var(--surface)",
        fg: i === 0 ? "var(--green-text)" : "var(--fg)",
        chips: chips.slice(0, 3).map((p) => ({
          id: p.id,
          time: new Date(p.scheduledFor!).toTimeString().slice(0, 5),
          label: p.slides[0]?.headline ?? p.id,
          rule: p.state === "failed" ? "var(--red)" : p.state === "ready" ? "var(--green)" : "var(--border-strong)",
        })),
        more: chips.length > 3 ? "+" + (chips.length - 3) + " more" : "",
      });
    }
    return out;
  }, [s.posts, now]);

  const nowDate = new Date(now);
  const monthPosts = s.posts.filter(
    (p) => p.scheduledFor && new Date(p.scheduledFor).getMonth() === nowDate.getMonth(),
  );

  const figures = [
    { value: String(monthPosts.filter((p) => p.state === "published").length), label: "posts published" },
    { value: String(monthPosts.filter((p) => p.state === "scheduled").length), label: "posts scheduled" },
    { value: num(monthPosts.reduce((a, p) => a + p.usage.inputTokens + p.usage.outputTokens, 0)), label: "tokens used" },
    { value: inr(monthPosts.reduce((a, p) => a + p.usage.estimatedCostInr, 0)), label: "est. spend" },
  ];

  const charts = useChartSpecs(now);
  const hasPosts = s.posts.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
      <section aria-labelledby="needs-h">
        <SectionHead
          id="needs-h"
          title="Needs you now"
          right={needs.length ? <span style={{ fontSize: 12, color: "var(--fg2)" }}>{needsSummary}</span> : null}
        />
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {needs.map((r) => (
            <li key={r.id} style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 2px", borderBottom: "1px solid var(--border)" }}>
              <div aria-hidden style={{ flex: "0 0 auto", display: "flex", paddingLeft: 8 }}>
                {r.thumbs.map((t, i) => (
                  <span key={i} style={{ width: 30, height: 38, borderRadius: "var(--r2)", border: "1px solid var(--border-strong)", background: t.tint, marginLeft: -8 }} />
                ))}
              </div>
              <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => s.go(`/posts/${r.id}`)}
                    style={{ border: 0, background: "transparent", padding: 0, fontSize: 14, fontWeight: 500, color: "var(--fg)", textAlign: "left" }}
                  >
                    {r.headline}
                  </button>
                  <Pill bg={r.pill.bg} fg={r.pill.fg} br={r.pill.br}>{r.stateLabel}</Pill>
                </div>
                <div style={{ fontSize: 12, color: "var(--fg2)", marginTop: 2 }}>{r.sub}</div>
              </div>
              <span style={{ flex: "0 0 auto", fontFamily: MONO, fontSize: 12, color: "var(--fg2)" }}>{r.id}</span>
              <div style={{ flex: "0 0 auto", display: "flex", gap: 8 }}>
                <button type="button" onClick={r.primary} style={{ padding: "5px 11px", border: "1px solid var(--green-line)", borderRadius: "var(--r3)", background: "var(--green-tint)", color: "var(--green-text)", fontSize: 12, fontWeight: 600 }}>
                  {r.primaryLabel}
                </button>
                <button type="button" onClick={() => s.go(`/posts/${r.id}`)} style={{ padding: "5px 11px", border: "1px solid var(--border)", borderRadius: "var(--r3)", background: "var(--surface)", color: "var(--fg2)", fontSize: 12 }}>
                  Open
                </button>
              </div>
            </li>
          ))}
        </ul>
        {needs.length === 0 ? (
          hasPosts ? (
            <div style={{ padding: "28px 2px", color: "var(--fg2)" }}>Nothing waiting on you — the queue is clear.</div>
          ) : (
            <EmptyState
              title="Nothing in the workspace yet"
              body="Create a goal and it will generate posts on its cadence. Anything needing review lands here."
              actionLabel="Create a goal"
              onAction={() => s.go("/goals/new")}
            />
          )
        ) : null}
      </section>

      <section aria-labelledby="next7-h">
        <SectionHead
          id="next7-h"
          title="Next 7 days"
          right={
            <button type="button" onClick={() => s.go("/calendar")} style={{ border: 0, background: "transparent", padding: 0, fontSize: 12, color: "var(--green-text)" }}>
              Open calendar
            </button>
          }
        />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", gap: 1, background: "var(--border)" }}>
          {week.map((d) => (
            <div key={d.key} style={{ background: d.bg, minHeight: 130, padding: 8 }}>
              <button
                type="button"
                onClick={() => s.go("/calendar")}
                style={{ display: "flex", alignItems: "baseline", gap: 6, width: "100%", border: 0, background: "transparent", padding: "0 0 6px", color: "var(--fg2)", fontSize: 12, textAlign: "left" }}
              >
                <span style={{ fontWeight: 600, color: d.fg }}>{d.dow}</span>
                <span>{d.day}</span>
              </button>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {d.chips.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => s.go(`/posts/${c.id}`)}
                    style={{ display: "flex", gap: 6, alignItems: "center", width: "100%", textAlign: "left", padding: "4px 6px", border: "1px solid var(--border)", borderLeft: `3px solid ${c.rule}`, borderRadius: "var(--r2)", background: "var(--surface)", fontSize: 12, color: "var(--fg2)", minWidth: 0 }}
                  >
                    <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--fg3)", flex: "0 0 auto" }}>{c.time}</span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--fg)" }}>{c.label}</span>
                  </button>
                ))}
                {d.more ? (
                  <button type="button" onClick={() => s.go("/calendar")} style={{ border: 0, background: "transparent", padding: "2px 6px", textAlign: "left", fontSize: 12, color: "var(--fg3)" }}>
                    {d.more}
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="month-h">
        <div style={{ paddingBottom: 10, borderBottom: "1px solid var(--border-strong)" }}>
          <h2 id="month-h" style={{ margin: 0, fontSize: 20, fontWeight: 600, lineHeight: 1.35 }}>This month</h2>
        </div>
        {hasPosts ? (
          <>
            <Figures figures={figures} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 1, marginTop: 28, background: "var(--border)", border: "1px solid var(--border)" }}>
              {charts.map((c) => (
                <Chart key={c.title} c={c} />
              ))}
            </div>
          </>
        ) : (
          <EmptyState
            title="No activity to chart"
            body="Token burn, queue state, spend by goal and throughput appear here once posts start running."
          />
        )}
      </section>
    </div>
  );
}

/** The four overview charts, computed exactly as the brief specifies. */
function useChartSpecs(now: number): ChartSpec[] {
  const { posts, goals, postsForGoal } = useReds();

  return useMemo(() => {
    const daily: { d: Date; t: number; c: number }[] = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(now - (29 - i) * DAY);
      const l = posts.filter((p) => p.scheduledFor && sameDay(new Date(p.scheduledFor), d));
      daily.push({
        d,
        t: l.reduce((a, p) => a + p.usage.inputTokens + p.usage.outputTokens, 0),
        c: l.reduce((a, p) => a + p.usage.estimatedCostInr, 0),
      });
    }
    const peak = Math.max(1, ...daily.map((x) => x.t));
    const totalTok = daily.reduce((a, x) => a + x.t, 0);

    const stateRows = (Object.keys(STATES) as (keyof typeof STATES)[]).map((k) => ({
      k,
      n: posts.filter((p) => p.state === k).length,
    }));
    const maxState = Math.max(1, ...stateRows.map((r) => r.n));
    const stateFill = (k: string) =>
      k === "failed" ? "var(--red)" : k === "ready" ? "var(--green)" : k === "published" ? "var(--g700)" : "var(--n300)";

    const goalRows = goals
      .map((g) => {
        const l = postsForGoal(g.id);
        return { label: g.name, spend: l.reduce((a, p) => a + p.usage.estimatedCostInr, 0), n: l.length };
      })
      .sort((a, b) => b.spend - a.spend);
    const maxSpend = Math.max(1, ...goalRows.map((r) => r.spend));
    const GS = ["var(--g500)", "var(--g600)", "var(--g700)", "var(--g800)", "var(--k400)", "var(--k500)"];

    const weeks = [];
    const nowDate = new Date(now);
    for (let i = 7; i >= 0; i--) {
      const from = new Date(now - (i * 7 + nowDate.getDay()) * DAY);
      const to = new Date(from.getTime() + 7 * DAY);
      const l = posts.filter((p) => p.scheduledFor && new Date(p.scheduledFor) >= from && new Date(p.scheduledFor) < to);
      weeks.push({
        from,
        pub: l.filter((p) => p.state === "published").length,
        sch: l.filter((p) => p.state === "scheduled" || p.state === "ready").length,
      });
    }
    const maxWeek = Math.max(1, ...weeks.flatMap((w) => [w.pub, w.sch]));

    const runRows = goals
      .map((g) => {
        const l = postsForGoal(g.id);
        const runs = l.reduce((a, p) => a + p.usage.runs, 0);
        return { label: g.name, avg: l.length ? runs / l.length : 0 };
      })
      .sort((a, b) => b.avg - a.avg);

    return [
      {
        title: "Token burn",
        note: "Daily, last 30 days. Peak and today are labelled.",
        total: num(totalTok) + " tokens",
        kind: "vertical",
        alt: "Daily token burn over 30 days, peaking at " + num(peak) + " tokens",
        bars: daily.map((x, i) => ({
          h: Math.round((x.t / peak) * 100) + "%",
          fill: x.t === peak ? "var(--green)" : i === 29 ? "var(--g700)" : "var(--green-tint2)",
          title: x.d.getDate() + " " + MON[x.d.getMonth()] + " — " + num(x.t) + " tokens, est. " + inr(x.c),
          label: x.t === peak ? num(x.t) : i === 29 ? "today" : "",
          labelFg: x.t === peak ? "var(--fg)" : "var(--fg3)",
        })),
        axisStart: absDT(iso(daily[0].d)).split(",")[0],
        axisEnd: absDT(iso(now)).split(",")[0],
      },
      {
        title: "Queue by state",
        note: "Where the " + posts.length + " posts in the workspace sit right now.",
        total: posts.length + " posts",
        kind: "horizontal",
        alt: "Post counts by state",
        rows: stateRows.map((r) => ({
          label: STATES[r.k].l,
          w: Math.round((r.n / maxState) * 100) + "%",
          fill: stateFill(r.k),
          value: String(r.n),
        })),
      },
      {
        title: "Est. spend by goal",
        note: "Cumulative, computed from the Accounts pricing table.",
        total: "est. " + inr(goalRows.reduce((a, r) => a + r.spend, 0)),
        kind: "horizontal",
        alt: "Estimated spend per goal",
        rows: goalRows.map((r, i) => ({
          label: r.label,
          w: Math.round((r.spend / maxSpend) * 100) + "%",
          fill: GS[i % GS.length],
          value: inr(r.spend),
        })),
      },
      {
        title: "Throughput",
        note: "Published against queued, by week.",
        total: weeks.reduce((a, w) => a + w.pub, 0) + " published",
        kind: "grouped",
        alt: "Published and queued posts per week over eight weeks",
        groups: weeks.map((w) => ({
          hA: Math.round((w.pub / maxWeek) * 100) + "%",
          hB: Math.round((w.sch / maxWeek) * 100) + "%",
          title: "Week of " + absDT(iso(w.from)).split(",")[0] + " — " + w.pub + " published, " + w.sch + " queued",
        })),
        legend: [
          { label: "Published", fill: "var(--green)" },
          { label: "Queued or ready", fill: "var(--n300)" },
        ],
        axisEnd:
          "avg. " +
          (runRows.length ? runRows.reduce((a, r) => a + r.avg, 0) / runRows.length : 0).toFixed(1) +
          " runs per post",
      },
    ];
  }, [posts, goals, postsForGoal, now]);
}
