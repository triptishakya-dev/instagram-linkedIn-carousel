"use client";

import { useState } from "react";
import { PILL, STATES } from "@/lib/reds/data";
import { DAY, DOW, MON, MONO, absDT, iso, sameDay } from "@/lib/reds/format";
import { chip, seg, useReds } from "../store";
import type { Post, PostState } from "@/lib/reds/types";

const SORTS: { v: string; label: string; cmp: (a: Post, b: Post, goalName: (id: string) => string) => number }[] = [
  { v: "time-asc", label: "Time, earliest first", cmp: (a, b) => +new Date(a.scheduledFor!) - +new Date(b.scheduledFor!) },
  { v: "time-desc", label: "Time, latest first", cmp: (a, b) => +new Date(b.scheduledFor!) - +new Date(a.scheduledFor!) },
  { v: "goal", label: "Goal, then time", cmp: (a, b, gn) => gn(a.goalId).localeCompare(gn(b.goalId)) || +new Date(a.scheduledFor!) - +new Date(b.scheduledFor!) },
  { v: "state", label: "State, then time", cmp: (a, b) => STATES[a.state].l.localeCompare(STATES[b.state].l) || +new Date(a.scheduledFor!) - +new Date(b.scheduledFor!) },
];

const LEG = ["var(--g500)", "var(--g700)", "var(--g300)", "var(--g900)", "var(--k400)", "var(--k600)"];

export function Calendar() {
  const s = useReds();
  if (s.now == null) return null;
  return <CalendarInner now={s.now} />;
}

function CalendarInner({ now }: { now: number }) {
  const s = useReds();

  const [view, setView] = useState<"month" | "week" | "agenda">("month");
  const [cursor, setCursor] = useState<string>(iso(now));
  const [calDay, setCalDay] = useState<string | null>(null);
  const [calDrag, setCalDrag] = useState<string | null>(null);
  const [calSort, setCalSort] = useState("time-asc");
  const [calPlatform, setCalPlatform] = useState<"all" | "instagram" | "linkedin">("all");

  const cur = new Date(cursor);
  const posts = s
    .filtered()
    .filter((p) => p.scheduledFor && (calPlatform === "all" || p.platforms.includes(calPlatform)));

  const goalName = (id: string) => s.goalById(id)?.name ?? "";
  const goalColor = (id: string) => LEG[s.goals.findIndex((g) => g.id === id) % LEG.length];
  const sortCmp = (SORTS.find((x) => x.v === calSort) || SORTS[0]).cmp;

  /** Reschedules a post to a new day, keeping its time-of-day. */
  const move = (postId: string, day: Date) => {
    const p = s.posts.find((x) => x.id === postId);
    if (!p) return;
    if (p.state === "published") {
      s.toast("Published posts can’t be moved");
      return;
    }
    const old = p.scheduledFor;
    const nd = new Date(day);
    const od = new Date(old!);
    nd.setHours(od.getHours(), od.getMinutes(), 0, 0);
    s.patchPost(postId, { scheduledFor: iso(nd) });
    s.toast(p.id + " moved to " + absDT(iso(nd)), () => s.patchPost(postId, { scheduledFor: old }));
  };

  const isMonth = view === "month";
  const isWeek = view === "week";

  const cells: Date[] = [];
  if (isMonth) {
    const first = new Date(cur.getFullYear(), cur.getMonth(), 1);
    const startAt = new Date(first.getTime() - first.getDay() * DAY);
    for (let i = 0; i < 42; i++) {
      const d = new Date(startAt.getTime() + i * DAY);
      if (i >= 35 && d.getMonth() !== cur.getMonth()) break;
      cells.push(d);
    }
  } else if (isWeek) {
    const startAt = new Date(cur.getTime() - cur.getDay() * DAY);
    for (let i = 0; i < 7; i++) cells.push(new Date(startAt.getTime() + i * DAY));
  }

  const shift = (n: number) => {
    const c = new Date(cursor);
    if (isMonth) c.setMonth(c.getMonth() + n);
    else c.setDate(c.getDate() + n * (isWeek ? 7 : 14));
    setCursor(iso(c));
  };

  const periodLabel = isMonth
    ? MON[cur.getMonth()] + " " + cur.getFullYear()
    : isWeek
      ? "Week of " + absDT(iso(new Date(cur.getTime() - cur.getDay() * DAY))).split(",")[0]
      : "Next 24 scheduled posts";

  const agenda = posts.slice().sort((a, b) => sortCmp(a, b, goalName)).slice(0, 24);
  const dayPosts = calDay ? posts.filter((p) => sameDay(new Date(p.scheduledFor!), new Date(calDay))) : [];
  const anyFilter = s.filterStates.length > 0 || s.filterGoal !== "all";
  const stateKeys = Object.keys(STATES) as PostState[];

  const chipFor = (p: Post) => ({
    id: p.id,
    time: new Date(p.scheduledFor!).toTimeString().slice(0, 5),
    label: p.slides[0]?.headline ?? p.id,
    icons: p.platforms.map((x) => (x === "instagram" ? "IG" : "LI")).join("/"),
    rule: goalColor(p.goalId),
    bg: p.state === "failed" ? "var(--red-bg)" : "var(--surface)",
  });

  return (
    <div
      tabIndex={0}
      role="group"
      aria-label="Calendar — press T to return to today"
      onKeyDown={(e) => { if (e.key === "t" || e.key === "T") setCursor(iso(now)); }}
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      {/* ---- filter panel ---- */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "12px 14px", border: "1px solid var(--border)", borderRadius: "var(--r4)", background: "var(--surface)" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, color: "var(--fg2)" }}>State</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {stateKeys.map((k) => {
              const on = s.filterStates.includes(k);
              const c = chip(on);
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on}
                  onClick={() => s.setFilterStates((f) => (on ? f.filter((x) => x !== k) : [...f, k]))}
                  style={{ padding: "3px 10px", border: `1px solid ${c.br}`, borderRadius: 999, background: c.bg, color: c.fg, fontSize: 11, whiteSpace: "nowrap" }}
                >
                  {STATES[k].l}
                </button>
              );
            })}
          </div>

          <span aria-hidden style={{ width: 1, height: 22, background: "var(--border)" }} />

          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--fg2)" }}>
            Goal
            <select
              value={s.filterGoal}
              onChange={(e) => s.setFilterGoal(e.target.value)}
              style={{ padding: "5px 8px", border: "1px solid var(--border)", borderRadius: "var(--r3)", background: "var(--surface2)", fontSize: 12, color: "var(--fg)", maxWidth: 190 }}
            >
              <option value="all">All goals</option>
              {s.goals.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </label>

          <div role="group" aria-label="Platform filter" style={{ display: "flex", gap: 2, padding: 2, border: "1px solid var(--border)", borderRadius: "var(--r3)", background: "var(--surface2)" }}>
            {([{ k: "all", label: "All" }, { k: "instagram", label: "IG" }, { k: "linkedin", label: "LI" }] as const).map((p) => {
              const on = calPlatform === p.k;
              const c = seg(on);
              return (
                <button key={p.k} type="button" aria-pressed={on} onClick={() => setCalPlatform(p.k)} style={{ border: 0, borderRadius: "var(--r2)", padding: "4px 10px", fontSize: 12, background: c.bg, color: c.fg }}>
                  {p.label}
                </button>
              );
            })}
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--fg2)" }}>
            Sort
            <select
              value={calSort}
              onChange={(e) => setCalSort(e.target.value)}
              style={{ padding: "5px 8px", border: "1px solid var(--border)", borderRadius: "var(--r3)", background: "var(--surface2)", fontSize: 12, color: "var(--fg)" }}
            >
              {SORTS.map((o) => (
                <option key={o.v} value={o.v}>{o.label}</option>
              ))}
            </select>
          </label>

          <span style={{ flex: "1 1 auto" }} />
          {anyFilter ? (
            <button type="button" onClick={() => { s.setFilterStates([]); s.setFilterGoal("all"); }} style={{ padding: "4px 10px", border: "1px solid var(--border)", borderRadius: 999, background: "transparent", color: "var(--fg2)", fontSize: 12 }}>
              Clear all
            </button>
          ) : null}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
          {s.goals.map((g) => (
            <span key={g.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--fg2)", whiteSpace: "nowrap" }}>
              <span aria-hidden style={{ width: 10, height: 10, borderRadius: "var(--r1)", background: goalColor(g.id), border: "1px solid var(--border-strong)" }} />
              {g.name}
              <span style={{ color: "var(--fg3)", fontFamily: MONO }}>{posts.filter((p) => p.goalId === g.id).length}</span>
            </span>
          ))}
          <span style={{ flex: "1 1 auto" }} />
          <span style={{ fontSize: 11, color: "var(--fg3)" }}>
            {view === "agenda"
              ? `${posts.length} posts match — sort applies to the agenda list.`
              : "Sort applies to the agenda view. Month and week place posts by date."}
          </span>
        </div>
      </div>

      <div style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
          <div role="group" aria-label="Calendar view" style={{ display: "flex", gap: 2, padding: 2, border: "1px solid var(--border)", borderRadius: "var(--r3)", background: "var(--surface2)" }}>
            {(["month", "week", "agenda"] as const).map((v) => {
              const on = view === v;
              const c = seg(on);
              return (
                <button key={v} type="button" aria-pressed={on} onClick={() => setView(v)} style={{ border: 0, borderRadius: "var(--r2)", padding: "4px 11px", fontSize: 12, background: c.bg, color: c.fg }}>
                  {v[0].toUpperCase() + v.slice(1)}
                </button>
              );
            })}
          </div>
          <button type="button" onClick={() => shift(-1)} aria-label="Previous period" style={{ padding: "4px 10px", border: "1px solid var(--border)", borderRadius: "var(--r3)", background: "var(--surface)", color: "var(--fg2)", fontSize: 12 }}>‹</button>
          <button type="button" onClick={() => shift(1)} aria-label="Next period" style={{ padding: "4px 10px", border: "1px solid var(--border)", borderRadius: "var(--r3)", background: "var(--surface)", color: "var(--fg2)", fontSize: 12 }}>›</button>
          <button type="button" onClick={() => setCursor(iso(now))} style={{ padding: "4px 10px", border: "1px solid var(--border)", borderRadius: "var(--r3)", background: "var(--surface)", color: "var(--fg2)", fontSize: 12 }}>Today</button>
          <strong style={{ fontSize: 14, fontWeight: 600 }}>{periodLabel}</strong>
        </div>

        {/* ---- month / week grid ---- */}
        {isMonth || isWeek ? (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", gap: 1, marginBottom: 1 }}>
              {DOW.map((d) => (
                <div key={d} style={{ padding: "6px 8px", fontSize: 12, color: "var(--fg2)" }}>{d}</div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", gap: 1, background: "var(--border)", border: "1px solid var(--border)" }}>
              {cells.map((d, i) => {
                const day = posts.filter((p) => sameDay(new Date(p.scheduledFor!), d));
                const inMonth = !isMonth || d.getMonth() === cur.getMonth();
                const cap = isWeek ? 6 : 2;
                const isToday = sameDay(d, new Date(now));
                return (
                  <div
                    key={i}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.preventDefault(); if (calDrag) { move(calDrag, d); setCalDrag(null); } }}
                    style={{ background: isToday ? "var(--surface2)" : inMonth ? "var(--surface)" : "var(--bg)", minHeight: isWeek ? 260 : 104, padding: 6, display: "flex", flexDirection: "column", gap: 4 }}
                  >
                    <span style={{ display: "flex", alignItems: "baseline", gap: 6, fontSize: 12, color: inMonth ? "var(--fg)" : "var(--fg3)" }}>
                      <span style={{ fontWeight: isToday ? 600 : 400 }}>{d.getDate()}</span>
                      {isToday ? <span style={{ fontSize: 11, color: "var(--green-text)" }}>today</span> : null}
                    </span>
                    {day.slice(0, cap).map(chipFor).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        draggable
                        onDragStart={(e) => { setCalDrag(c.id); if (e.dataTransfer) e.dataTransfer.effectAllowed = "move"; }}
                        onClick={() => s.go(`/posts/${c.id}`)}
                        style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", minWidth: 0, textAlign: "left", padding: "3px 6px", border: "1px solid var(--border)", borderLeft: `3px solid ${c.rule}`, borderRadius: "var(--r2)", background: c.bg, fontSize: 11, cursor: "grab" }}
                      >
                        <span style={{ flex: "0 0 auto", fontWeight: 600, color: "var(--fg2)" }}>{c.icons}</span>
                        <span style={{ flex: "0 0 auto", color: "var(--fg3)", fontVariantNumeric: "tabular-nums" }}>{c.time}</span>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--fg)" }}>{c.label}</span>
                      </button>
                    ))}
                    {day.length > cap ? (
                      <button type="button" onClick={() => setCalDay(iso(d))} style={{ border: 0, background: "transparent", padding: "2px 6px", textAlign: "left", fontSize: 11, color: "var(--fg3)" }}>
                        +{day.length - cap} more
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* ---- agenda ---- */}
        {view === "agenda" ? (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, borderTop: "1px solid var(--border-strong)" }}>
            {agenda.map((p) => {
              const st = STATES[p.state];
              const pill = PILL[st.t];
              return (
                <li key={p.id} style={{ display: "flex", alignItems: "center", gap: 16, padding: "10px 2px", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ flex: "0 0 120px", fontSize: 12, color: "var(--fg2)", fontVariantNumeric: "tabular-nums" }}>{absDT(p.scheduledFor)}</span>
                  <span aria-hidden style={{ width: 3, alignSelf: "stretch", background: goalColor(p.goalId), borderRadius: 2 }} />
                  <span style={{ flex: "0 0 auto", fontSize: 11, fontWeight: 600, color: "var(--fg2)" }}>
                    {p.platforms.map((x) => (x === "instagram" ? "IG" : "LI")).join("/")}
                  </span>
                  <button type="button" onClick={() => s.go(`/posts/${p.id}`)} style={{ flex: "1 1 auto", minWidth: 0, border: 0, background: "transparent", padding: 0, textAlign: "left", fontSize: 13, color: "var(--fg)" }}>
                    {p.slides[0]?.headline ?? p.id}
                  </button>
                  <span style={{ flex: "0 0 auto", fontSize: 11, padding: "2px 8px", borderRadius: 999, background: pill.bg, color: pill.fg, border: `1px solid ${pill.br}` }}>{st.l}</span>
                  <span style={{ flex: "0 0 auto", fontSize: 12, color: "var(--fg2)" }}>{goalName(p.goalId)}</span>
                </li>
              );
            })}
          </ul>
        ) : null}

        {/* ---- day popover ---- */}
        {calDay ? (
          <div style={{ padding: 12, border: "1px solid var(--border)", borderRadius: "var(--r4)", background: "var(--surface)", boxShadow: "var(--shadow)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <strong style={{ fontSize: 13 }}>{absDT(calDay).split(",")[0]}</strong>
              <span style={{ flex: "1 1 auto" }} />
              <button type="button" onClick={() => setCalDay(null)} style={{ border: 0, background: "transparent", color: "var(--fg2)", fontSize: 12 }}>Close</button>
            </div>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              {dayPosts.map((p) => (
                <li key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12 }}>
                  <span style={{ color: "var(--fg3)", fontVariantNumeric: "tabular-nums" }}>
                    {new Date(p.scheduledFor!).toTimeString().slice(0, 5)}
                  </span>
                  <button type="button" onClick={() => s.go(`/posts/${p.id}`)} style={{ border: 0, background: "transparent", padding: 0, textAlign: "left", color: "var(--fg)", fontSize: 12 }}>
                    {p.slides[0]?.headline ?? p.id}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
