"use client";

import { useMemo, useState } from "react";
import { PILL, STATES } from "@/lib/reds/data";
import { MONO, absDT, inr, num, relDT } from "@/lib/reds/format";
import { EmptyState } from "../charts";
import { useReds } from "../store";
import type { Post, PostState } from "@/lib/reds/types";

const HEADCOLS: [string, string, "left" | "right"][] = [
  ["carousel", "Carousel", "left"],
  ["id", "Post ID", "left"],
  ["goal", "Goal", "left"],
  ["platforms", "Platforms", "left"],
  ["state", "State", "left"],
  ["scheduled", "Scheduled for", "left"],
  ["tokens", "Tokens used", "right"],
  ["cost", "Est. cost", "right"],
  ["gen", "Gen. time", "right"],
  ["runs", "Runs", "right"],
  ["updated", "Updated", "left"],
];

const GROUP_OPTS = [
  { v: "none", label: "No grouping" },
  { v: "goal", label: "Group by goal" },
  { v: "state", label: "Group by state" },
  { v: "platform", label: "Group by platform" },
  { v: "scheduledDay", label: "Group by scheduled day" },
  { v: "model", label: "Group by model" },
];

const VIEWS: { label: string; states: PostState[]; sort: { col: string; dir: "asc" | "desc" }[]; groupBy: string }[] = [
  { label: "Needs review", states: ["ready", "failed"], sort: [{ col: "scheduled", dir: "asc" }], groupBy: "state" },
  { label: "Scheduled this week", states: ["scheduled"], sort: [{ col: "scheduled", dir: "asc" }], groupBy: "scheduledDay" },
  { label: "Failed", states: ["failed"], sort: [{ col: "runs", dir: "desc" }], groupBy: "goal" },
];

interface Section {
  key: string;
  showHeader: boolean;
  open: boolean;
  caret: string;
  label: string;
  count: string;
  tokens: string;
  cost: string;
  rows: Post[];
}

export function Posts() {
  const s = useReds();
  if (s.now == null) return null;
  return <PostsInner now={s.now} />;
}

function PostsInner({ now }: { now: number }) {
  const s = useReds();
  const { goalById, modelById } = s;
  const [colMenu, setColMenu] = useState(false);
  const [scrub, setScrub] = useState<{ id: string; i: number } | null>(null);

  const rowPad = s.density === "compact" ? 6 : 12;

  // ---- filter, sort, paginate ----
  const filteredRows = s.filtered();

  const sorted = useMemo(() => {
    if (!s.sort.length) return filteredRows;
    const val = (p: Post, col: string) =>
      ({
        id: p.id,
        goal: goalById(p.goalId)?.name ?? "",
        state: p.state,
        scheduled: p.scheduledFor ? new Date(p.scheduledFor).getTime() : 0,
        tokens: p.usage.inputTokens + p.usage.outputTokens,
        cost: p.usage.estimatedCostInr,
        gen: p.usage.generationMs,
        runs: p.usage.runs,
        updated: new Date(p.updatedAt).getTime(),
        platforms: p.platforms.join(","),
        carousel: p.slides.length,
      })[col];

    return filteredRows.slice().sort((a, b) => {
      for (const { col, dir } of s.sort) {
        const x = val(a, col)!;
        const y = val(b, col)!;
        if (x < y) return dir === "asc" ? -1 : 1;
        if (x > y) return dir === "asc" ? 1 : -1;
      }
      return 0;
    });
  }, [filteredRows, s.sort, goalById]);

  const total = filteredRows.length;
  const pageRows = sorted.slice((s.page - 1) * s.pageSize, s.page * s.pageSize);

  const toggleSort = (col: string, shift: boolean) => {
    s.setSort((cur) => {
      const at = cur.find((x) => x.col === col);
      if (!shift) return !at ? [{ col, dir: "asc" }] : at.dir === "asc" ? [{ col, dir: "desc" }] : [];
      if (!at) return [...cur, { col, dir: "asc" as const }];
      if (at.dir === "asc") return cur.map((x) => (x.col === col ? { col, dir: "desc" as const } : x));
      return cur.filter((x) => x.col !== col);
    });
    s.setPage(1);
  };

  const headers = HEADCOLS.filter((c) => s.cols[c[0]]).map((c) => {
    const at = s.sort.findIndex((x) => x.col === c[0]);
    const cur = s.sort[at];
    return {
      key: c[0],
      label: c[1],
      align: c[2],
      justify: c[2] === "right" ? "flex-end" : "flex-start",
      fg: cur ? "var(--green-text)" : "var(--fg2)",
      ind: cur ? (cur.dir === "asc" ? "▲" : "▼") + (s.sort.length > 1 ? String(at + 1) : "") : "",
      ariaSort: cur ? (cur.dir === "asc" ? ("ascending" as const) : ("descending" as const)) : ("none" as const),
    };
  });

  // ---- grouping ----
  const sections = useMemo<Section[]>(() => {
    if (s.groupBy === "none")
      return [{ key: "all", showHeader: false, open: true, caret: "", label: "", count: "", tokens: "", cost: "", rows: pageRows }];
    const keyOf = (p: Post) =>
      s.groupBy === "goal" ? goalById(p.goalId)?.name ?? "—"
        : s.groupBy === "state" ? STATES[p.state].l
          : s.groupBy === "platform" ? p.platforms.map((x) => (x === "instagram" ? "Instagram" : "LinkedIn")).join(" + ")
            : s.groupBy === "model" ? modelById(p.usage.modelId)?.label ?? "—"
              : p.scheduledFor ? absDT(p.scheduledFor).split(",")[0] : "Not scheduled";

    const map = new Map<string, Post[]>();
    pageRows.forEach((p) => {
      const k = keyOf(p);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(p);
    });
    return [...map.entries()].map(([k, list]) => {
      const open = !s.closedGroups[k];
      const tok = list.reduce((a, p) => a + p.usage.inputTokens + p.usage.outputTokens, 0);
      const cost = list.reduce((a, p) => a + p.usage.estimatedCostInr, 0);
      return {
        key: k,
        showHeader: true,
        open,
        caret: open ? "▾" : "▸",
        label: k,
        count: list.length + (list.length === 1 ? " post" : " posts"),
        tokens: num(tok) + " tokens",
        cost: "est. " + inr(cost),
        rows: open ? list : [],
      };
    });
  }, [pageRows, s.groupBy, s.closedGroups, goalById, modelById]);

  // ---- selection ----
  const selIds = Object.keys(s.sel).filter((k) => s.sel[k]);
  const selCostVal = selIds.reduce((a, id) => {
    const p = s.posts.find((x) => x.id === id);
    return a + (p ? p.usage.estimatedCostInr / p.usage.runs : 0);
  }, 0);
  const allSel = pageRows.length > 0 && pageRows.every((p) => s.sel[p.id]);

  const bulkActions = [
    { label: "Approve", fg: "var(--fg2)", br: "var(--border)", run: () => { selIds.forEach((id) => s.patchPost(id, { state: "scheduled" })); s.toast(selIds.length + " posts approved"); s.setSel({}); } },
    { label: "Reschedule", fg: "var(--fg2)", br: "var(--border)", run: () => s.toast("Reschedule sheet is not wired in this pass") },
    { label: "Regenerate", fg: "var(--fg2)", br: "var(--border)", run: () => s.toast("Regenerating " + selIds.length + " posts — est. " + inr(selCostVal)) },
    { label: "Change model", fg: "var(--fg2)", br: "var(--border)", run: () => s.toast(s.models[0] ? "Model changed to " + s.models[0].label : "No models configured — add one in Accounts") },
    { label: "Delete", fg: "var(--red)", br: "var(--red-br)", run: () => { const old = s.posts; s.setPosts((ps) => ps.filter((p) => !s.sel[p.id])); s.setSel({}); s.toast(selIds.length + " posts deleted", () => s.setPosts(old)); } },
  ];

  const anyFilter = s.filterStates.length > 0 || s.filterGoal !== "all";
  const stateKeys = Object.keys(STATES) as PostState[];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* ---- filter bar ---- */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        {VIEWS.map((v) => {
          const on =
            v.states.length === s.filterStates.length &&
            v.states.every((x) => s.filterStates.includes(x)) &&
            s.groupBy === v.groupBy;
          return (
            <button
              key={v.label}
              type="button"
              aria-pressed={on}
              onClick={() => { s.setFilterStates(v.states); s.setSort(v.sort); s.setGroupBy(v.groupBy); s.setPage(1); }}
              style={{ padding: "5px 11px", border: `1px solid ${on ? "var(--green-line)" : "var(--border)"}`, borderRadius: "var(--r3)", background: on ? "var(--green-tint)" : "var(--surface)", color: on ? "var(--green-text)" : "var(--fg2)", fontSize: 12, fontWeight: 500 }}
            >
              {v.label}
            </button>
          );
        })}

        <span aria-hidden style={{ width: 1, height: 22, background: "var(--border)", margin: "0 4px" }} />

        {stateKeys.map((k) => {
          const on = s.filterStates.includes(k);
          return (
            <button
              key={k}
              type="button"
              aria-pressed={on}
              onClick={() => { s.setFilterStates((f) => (on ? f.filter((x) => x !== k) : [...f, k])); s.setPage(1); }}
              style={{ padding: "4px 10px", border: `1px solid ${on ? "var(--green-line)" : "var(--border)"}`, borderRadius: 999, background: on ? "var(--green-tint)" : "transparent", color: on ? "var(--green-text)" : "var(--fg2)", fontSize: 12 }}
            >
              {STATES[k].l}
            </button>
          );
        })}

        <select
          aria-label="Filter by goal"
          value={s.filterGoal}
          onChange={(e) => { s.setFilterGoal(e.target.value); s.setPage(1); }}
          style={{ padding: "5px 8px", border: "1px solid var(--border)", borderRadius: "var(--r3)", background: "var(--surface)", fontSize: 12 }}
        >
          <option value="all">All goals</option>
          {s.goals.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>

        <select
          aria-label="Group by"
          value={s.groupBy}
          onChange={(e) => s.setGroupBy(e.target.value)}
          style={{ padding: "5px 8px", border: "1px solid var(--border)", borderRadius: "var(--r3)", background: "var(--surface)", fontSize: 12 }}
        >
          {GROUP_OPTS.map((o) => (
            <option key={o.v} value={o.v}>{o.label}</option>
          ))}
        </select>

        {anyFilter ? (
          <button
            type="button"
            onClick={() => { s.setFilterStates([]); s.setFilterGoal("all"); s.setPage(1); }}
            style={{ padding: "4px 10px", border: "1px solid var(--border)", borderRadius: 999, background: "transparent", color: "var(--fg2)", fontSize: 12 }}
          >
            Clear all
          </button>
        ) : null}

        <span style={{ flex: "1 1 auto" }} />

        <div role="group" aria-label="Row density" style={{ display: "flex", gap: 2, padding: 2, border: "1px solid var(--border)", borderRadius: "var(--r3)", background: "var(--surface2)" }}>
          {(["compact", "comfortable"] as const).map((d) => {
            const on = s.density === d;
            return (
              <button key={d} type="button" aria-pressed={on} onClick={() => s.setDensity(d)} style={{ border: 0, borderRadius: "var(--r2)", padding: "3px 9px", fontSize: 12, background: on ? "var(--surface)" : "transparent", color: on ? "var(--fg)" : "var(--fg3)" }}>
                {d === "compact" ? "Compact" : "Comfortable"}
              </button>
            );
          })}
        </div>

        <div style={{ position: "relative" }}>
          <button type="button" aria-expanded={colMenu} onClick={() => setColMenu(!colMenu)} style={{ padding: "5px 11px", border: "1px solid var(--border)", borderRadius: "var(--r3)", background: "var(--surface)", color: "var(--fg2)", fontSize: 12 }}>
            Columns
          </button>
          {colMenu ? (
            <div style={{ position: "absolute", right: 0, top: 34, zIndex: 40, width: 212, padding: 8, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r4)", boxShadow: "var(--shadow)" }}>
              {HEADCOLS.map((c) => (
                <label key={c[0]} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 6px", fontSize: 13, color: "var(--fg2)" }}>
                  <input type="checkbox" checked={!!s.cols[c[0]]} onChange={() => s.setCols((x) => ({ ...x, [c[0]]: !x[c[0]] }))} style={{ accentColor: "var(--green-line)" }} />
                  {c[1]}
                </label>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {/* ---- bulk bar ---- */}
      {selIds.length > 0 ? (
        <div role="region" aria-label="Bulk actions" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, padding: "8px 12px", border: "1px solid var(--green-line)", borderRadius: "var(--r3)", background: "var(--green-tint)" }}>
          <strong style={{ fontSize: 13, color: "var(--green-text)" }}>{selIds.length} selected</strong>
          <span style={{ fontSize: 12, color: "var(--fg2)" }}>Regenerating all of them costs {inr(selCostVal)} est.</span>
          <span style={{ flex: "1 1 auto" }} />
          {bulkActions.map((a) => (
            <button key={a.label} type="button" onClick={a.run} style={{ padding: "5px 11px", border: `1px solid ${a.br}`, borderRadius: "var(--r3)", background: "var(--surface)", color: a.fg, fontSize: 12 }}>
              {a.label}
            </button>
          ))}
          <button type="button" onClick={() => s.setSel({})} style={{ border: 0, background: "transparent", color: "var(--fg2)", fontSize: 12, padding: 4 }}>Clear</button>
        </div>
      ) : null}

      {/* ---- table ---- */}
      <div style={{ overflowX: "auto", borderTop: "1px solid var(--border-strong)" }}>
        <table style={{ width: "100%", minWidth: 1120, fontSize: 13 }}>
          <thead>
            <tr>
              <th scope="col" style={{ width: 34, padding: "8px 10px", textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                <input
                  type="checkbox"
                  aria-label="Select all rows on this page"
                  checked={allSel}
                  onChange={() => {
                    const next = { ...s.sel };
                    pageRows.forEach((p) => { next[p.id] = !allSel; });
                    s.setSel(next);
                  }}
                  style={{ accentColor: "var(--green-line)" }}
                />
              </th>
              {headers.map((h) => (
                <th key={h.key} scope="col" aria-sort={h.ariaSort} style={{ padding: 0, borderBottom: "1px solid var(--border)", textAlign: h.align, whiteSpace: "nowrap" }}>
                  <button
                    type="button"
                    onClick={(e) => toggleSort(h.key, e.shiftKey)}
                    style={{ display: "flex", alignItems: "center", gap: 5, width: "100%", justifyContent: h.justify, border: 0, background: "transparent", padding: "8px 10px", fontSize: 12, fontWeight: 500, color: h.fg }}
                  >
                    {h.label}
                    <span aria-hidden style={{ fontSize: 10, color: "var(--green-text)" }}>{h.ind}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>

          {sections.map((sec) => (
            <tbody key={sec.key}>
              {sec.showHeader ? (
                <tr>
                  <th scope="colgroup" colSpan={headers.length + 1} style={{ padding: 0, textAlign: "left", background: "var(--sunken)", borderBottom: "1px solid var(--border)" }}>
                    <button
                      type="button"
                      aria-expanded={sec.open}
                      onClick={() => s.setClosedGroups((c) => ({ ...c, [sec.key]: !!sec.open }))}
                      style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", border: 0, background: "transparent", padding: "7px 10px", fontSize: 12, fontWeight: 600, color: "var(--fg)" }}
                    >
                      <span aria-hidden style={{ color: "var(--fg3)", width: 8 }}>{sec.caret}</span>
                      {sec.label}
                      <span style={{ fontWeight: 400, color: "var(--fg2)" }}>{sec.count}</span>
                      <span style={{ flex: "1 1 auto" }} />
                      <span style={{ fontWeight: 400, color: "var(--fg2)", fontFamily: MONO }}>{sec.tokens}</span>
                      <span style={{ fontWeight: 400, color: "var(--fg2)", fontFamily: MONO }}>{sec.cost}</span>
                    </button>
                  </th>
                </tr>
              ) : null}

              {sec.rows.map((p) => {
                const st = STATES[p.state];
                const pill = PILL[st.t];
                const idx = scrub && scrub.id === p.id ? scrub.i : 0;
                const sl = p.slides[Math.min(idx, p.slides.length - 1)];
                const tint = s.assetById(sl.assetId)?.tint || "var(--n200)";
                const tok = p.usage.inputTokens + p.usage.outputTokens;
                const ig = p.platforms.includes("instagram");
                const li = p.platforms.includes("linkedin");
                const selected = !!s.sel[p.id];

                return (
                  <tr key={p.id} style={{ background: selected ? "var(--green-tint)" : "transparent", borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: `${rowPad}px 10px` }}>
                      <input
                        type="checkbox"
                        aria-label={"Select " + p.id}
                        checked={selected}
                        onChange={() => { s.setSel((x) => ({ ...x, [p.id]: !x[p.id] })); s.setLastSel(p.id); }}
                        onClick={(e) => {
                          if (!e.shiftKey || !s.lastSel) return;
                          const ids = pageRows.map((x) => x.id);
                          const a = ids.indexOf(s.lastSel);
                          const b = ids.indexOf(p.id);
                          if (a < 0 || b < 0) return;
                          const range = ids.slice(Math.min(a, b), Math.max(a, b) + 1);
                          const next = { ...s.sel };
                          range.forEach((id) => { next[id] = true; });
                          s.setSel(next);
                        }}
                        style={{ accentColor: "var(--green-line)" }}
                      />
                    </td>

                    {s.cols.carousel ? (
                      <td style={{ padding: `${rowPad}px 10px` }}>
                        <div
                          onMouseMove={(e) => {
                            const r = e.currentTarget.getBoundingClientRect();
                            const i = Math.max(0, Math.min(p.slides.length - 1, Math.floor(((e.clientX - r.left) / r.width) * p.slides.length)));
                            if (!scrub || scrub.id !== p.id || scrub.i !== i) setScrub({ id: p.id, i });
                          }}
                          onMouseLeave={() => setScrub(null)}
                          style={{ display: "flex", alignItems: "center", width: 104, paddingLeft: 9 }}
                        >
                          <span aria-hidden style={{ width: 26, height: 33, borderRadius: "var(--r2)", border: "1px solid var(--border)", background: "var(--n100)", marginLeft: -9 }} />
                          <span aria-hidden style={{ width: 26, height: 33, borderRadius: "var(--r2)", border: "1px solid var(--border)", background: "var(--n200)", marginLeft: -9 }} />
                          <span
                            aria-hidden
                            style={{ position: "relative", width: 26, height: 33, borderRadius: "var(--r2)", border: "1px solid var(--border-strong)", background: tint, marginLeft: -9, display: "flex", alignItems: "flex-end", padding: 2, fontSize: 9, color: "var(--fg3)", fontFamily: MONO, overflow: "hidden" }}
                          >
                            {/* A generated slide has a real rendered image; the
                                tint behind it is the fallback for one that does
                                not, so the cell never shows a broken image. */}
                            {sl.previewUrl ? (
                              <img
                                src={sl.previewUrl}
                                alt=""
                                loading="lazy"
                                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                              />
                            ) : null}
                            <span style={{ position: "relative", textShadow: sl.previewUrl ? "0 1px 2px rgba(0,0,0,.8)" : "none", color: sl.previewUrl ? "#fff" : "var(--fg3)" }}>
                              {sl.index + 1}/{p.slides.length}
                            </span>
                          </span>
                          <span style={{ marginLeft: 7, fontSize: 11, color: "var(--fg3)", fontFamily: MONO }}>
                            {p.slides.length > 3 ? "+" + (p.slides.length - 3) : ""}
                          </span>
                        </div>
                      </td>
                    ) : null}

                    {s.cols.id ? (
                      <td style={{ padding: `${rowPad}px 10px` }}>
                        <button type="button" onClick={() => s.go(`/posts/${p.id}`)} style={{ border: 0, background: "transparent", padding: 0, fontFamily: MONO, fontSize: 12, color: "var(--green-text)" }}>
                          {p.id}
                        </button>
                      </td>
                    ) : null}

                    {s.cols.goal ? (
                      <td style={{ padding: `${rowPad}px 10px`, maxWidth: 210 }}>
                        <button type="button" onClick={() => s.go(`/goals/${p.goalId}`)} style={{ border: 0, background: "transparent", padding: 0, textAlign: "left", color: "var(--fg)", fontSize: 13 }}>
                          {s.goalById(p.goalId)?.name}
                        </button>
                      </td>
                    ) : null}

                    {s.cols.platforms ? (
                      <td style={{ padding: `${rowPad}px 10px` }}>
                        <span style={{ display: "inline-flex", gap: 4, fontSize: 11, fontWeight: 600 }}>
                          <span title={ig ? "Instagram — targeted" : "Instagram — not targeted"} style={{ padding: "1px 5px", borderRadius: "var(--r2)", border: "1px solid var(--border)", color: ig ? "var(--fg)" : "var(--fg3)", opacity: ig ? 1 : 0.4 }}>IG</span>
                          <span title={li ? "LinkedIn — targeted" : "LinkedIn — not targeted"} style={{ padding: "1px 5px", borderRadius: "var(--r2)", border: "1px solid var(--border)", color: li ? "var(--fg)" : "var(--fg3)", opacity: li ? 1 : 0.4 }}>LI</span>
                        </span>
                      </td>
                    ) : null}

                    {s.cols.state ? (
                      <td style={{ padding: `${rowPad}px 10px` }}>
                        <span style={{ display: "inline-block", fontSize: 11, padding: "2px 8px", borderRadius: 999, background: pill.bg, color: pill.fg, border: `1px solid ${pill.br}`, whiteSpace: "nowrap" }}>
                          {st.l}
                        </span>
                      </td>
                    ) : null}

                    {s.cols.scheduled ? (
                      <td style={{ padding: `${rowPad}px 10px`, whiteSpace: "nowrap" }}>
                        <span style={{ color: "var(--fg)" }}>{absDT(p.scheduledFor)}</span>{" "}
                        <span style={{ color: "var(--fg3)", fontSize: 12 }}>{p.scheduledFor ? relDT(p.scheduledFor, now) : "not scheduled"}</span>
                      </td>
                    ) : null}

                    {s.cols.tokens ? (
                      <td title={num(p.usage.inputTokens) + " in / " + num(p.usage.outputTokens) + " out"} style={{ padding: `${rowPad}px 10px`, textAlign: "right", fontFamily: MONO, fontSize: 12, color: "var(--fg2)" }}>
                        {num(tok)}
                      </td>
                    ) : null}

                    {s.cols.cost ? (
                      <td style={{ padding: `${rowPad}px 10px`, textAlign: "right", fontFamily: MONO, fontSize: 12, whiteSpace: "nowrap" }}>
                        <span style={{ color: "var(--fg3)" }}>est.</span> {inr(p.usage.estimatedCostInr)}
                      </td>
                    ) : null}

                    {s.cols.gen ? (
                      <td style={{ padding: `${rowPad}px 10px`, textAlign: "right", fontFamily: MONO, fontSize: 12, color: "var(--fg2)" }}>
                        {(p.usage.generationMs / 1000).toFixed(1)}s
                      </td>
                    ) : null}

                    {s.cols.runs ? (
                      <td style={{ padding: `${rowPad}px 10px`, textAlign: "right", fontFamily: MONO, fontSize: 12, color: p.usage.runs >= 4 ? "var(--amber)" : "var(--fg2)" }}>
                        {p.usage.runs}
                      </td>
                    ) : null}

                    {s.cols.updated ? (
                      <td title={absDT(p.updatedAt)} style={{ padding: `${rowPad}px 10px`, color: "var(--fg2)", fontSize: 12, whiteSpace: "nowrap" }}>
                        {relDT(p.updatedAt, now)}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>

      {total === 0 ? (
        anyFilter ? (
          <EmptyState
            title="No posts match these filters"
            body="State and goal filters are excluding every post in the workspace."
            actionLabel="Clear filters"
            onAction={() => { s.setFilterStates([]); s.setFilterGoal("all"); }}
          />
        ) : (
          <EmptyState
            title="No posts yet"
            body="Posts are produced by goals. Create one and it will drop drafts into this queue on its cadence."
            actionLabel="Create a goal"
            onAction={() => s.go("/goals/new")}
          />
        )
      ) : null}

      {/* ---- pagination ---- */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 12, color: "var(--fg2)" }}>
        <span>
          {total
            ? `${(s.page - 1) * s.pageSize + 1}–${Math.min(total, s.page * s.pageSize)} of ${total} posts`
            : "0 posts"}
        </span>
        <span style={{ flex: "1 1 auto" }} />
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          Rows
          <select
            aria-label="Rows per page"
            value={s.pageSize}
            onChange={(e) => { s.setPageSize(Number(e.target.value)); s.setPage(1); }}
            style={{ padding: "4px 6px", border: "1px solid var(--border)", borderRadius: "var(--r2)", background: "var(--surface)" }}
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </label>
        <button type="button" onClick={() => s.setPage((p) => Math.max(1, p - 1))} style={{ padding: "4px 10px", border: "1px solid var(--border)", borderRadius: "var(--r3)", background: "var(--surface)", color: "var(--fg2)", opacity: s.page > 1 ? 1 : 0.45 }}>
          Previous
        </button>
        <button type="button" onClick={() => s.setPage((p) => (p * s.pageSize < total ? p + 1 : p))} style={{ padding: "4px 10px", border: "1px solid var(--border)", borderRadius: "var(--r3)", background: "var(--surface)", color: "var(--fg2)", opacity: s.page * s.pageSize < total ? 1 : 0.45 }}>
          Next
        </button>
      </div>
    </div>
  );
}
