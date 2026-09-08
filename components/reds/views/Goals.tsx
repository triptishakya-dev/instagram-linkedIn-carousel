"use client";

import { useEffect, useState } from "react";
import {
  ApiClientError,
  blockingPostsOf,
  deleteGoal,
  type BlockingPost,
  type DeleteGoalResult,
} from "@/lib/api-client";
import { PILL } from "@/lib/reds/data";
import { MONO, absDT, inr, inrCost, num, relDT } from "@/lib/reds/format";
import { EmptyState } from "../charts";
import { useReds } from "../store";
import type { Goal } from "@/lib/reds/types";

const CAD: Record<string, string> = {
  daily: "Daily",
  alternate: "Alternate days",
  weekly: "Weekly",
  monthly: "Monthly",
};

const SPILL: Record<Goal["status"], "g" | "n"> = { active: "g", paused: "n", ended: "n" };

/**
 * Goal ids with a delete in flight.
 *
 * Module scope rather than a ref: the guard has to be readable synchronously
 * from the confirm dialog's callback, and that callback is built into the
 * `actions` array during render — reading a ref from there trips the refs
 * rule, which cannot see that the closure only ever runs from a click. The
 * `deleting` state below is what actually drives the rendering.
 */
const inFlightDeletes = new Set<string>();

const HEADERS: { label: string; align: "left" | "right" }[] = [
  { label: "Name", align: "left" },
  { label: "Platforms", align: "left" },
  { label: "Cadence", align: "left" },
  { label: "Window", align: "left" },
  { label: "Posts", align: "right" },
  { label: "Tokens", align: "right" },
  { label: "Est. spend to date", align: "right" },
  { label: "Status", align: "left" },
  { label: "Last run", align: "left" },
  { label: "", align: "right" },
];

export function Goals() {
  const s = useReds();
  if (s.now == null) return null;
  return <GoalsInner now={s.now} />;
}

function GoalsInner({ now }: { now: number }) {
  const s = useReds();

  /**
   * Per-goal usage out of the shared report -- a lookup, not another fetch.
   * `byGoal` is already bucketed by the aggregation layer, so every goal's
   * figures come from the same pass as the dashboard's and the footer's.
   */
  const usageForGoal = (goalId: string) =>
    s.usage?.allTime.byGoal.find((b) => b.key === goalId) ?? null;

  useEffect(() => {
    fetch("/api/goals")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.goals && Array.isArray(data.goals)) {
          s.setGoals(
            data.goals.map((g: any) => ({
              id: g.id,
              name: g.name,
              platforms: (g.platforms || []).map((p: string) => p.toLowerCase()),
              brandLogoAssetId: g.brandLogoAssetId || "",
              captionPrompt: g.captionPrompt || "",
              imagePrompt: g.imagePrompt || "",
              startDate: g.startDate,
              endDate: g.endDate,
              schedule: g.schedule || { cadence: "weekly", time: "09:30", weekdays: [], monthDay: 1 },
              referenceAssetIds: g.referenceAssetIds || [],
              imageAssetIds: g.imageAssetIds || [],
              modelId: g.modelId || "",
              status: (g.status || "ACTIVE").toLowerCase(),
              createdAt: g.createdAt,
              updatedAt: g.updatedAt,
            })),
          );
        }
      })
      .catch(() => {});
  }, []);

  const newGoal = () => {
    s.setGoalDraft(null);
    s.setGoalTouched({});
    s.go("/goals/new");
  };

  /** Rows with a delete in flight, so each can show its own progress. */
  const [deleting, setDeleting] = useState<Record<string, boolean>>({});

  const deleteSummary = (g: Goal, r: DeleteGoalResult) => {
    if (r.detachedPostCount === 0) return `${g.name} deleted`;

    const posts = `${r.detachedPostCount} post${r.detachedPostCount === 1 ? "" : "s"}`;
    const still = r.detachedScheduledCount > 0
      ? `, ${r.detachedScheduledCount} still scheduled`
      : "";
    return `${g.name} deleted — ${posts} kept${still}`;
  };

  const runDelete = async (g: Goal, force: boolean) => {
    // The confirm dialog stays open until the request lands, so a second
    // click would arrive before a state update could disable anything.
    if (inFlightDeletes.has(g.id)) return;
    inFlightDeletes.add(g.id);
    setDeleting((d) => ({ ...d, [g.id]: true }));

    try {
      const result = await deleteGoal(g.id, { force });
      s.ask(null);
      // Only now: the row stays on screen until the server has actually
      // dropped it, so a failed delete does not read as a successful one.
      s.setGoals((gs) => gs.filter((x) => x.id !== g.id));
      s.setPosts((ps) => ps.map((p) => (p.goalId === g.id ? { ...p, goalId: "" } : p)));
      if (s.filterGoal === g.id) s.setFilterGoal("all");
      s.toast(deleteSummary(g, result));
    } catch (err) {
      const blocking = blockingPostsOf(err);

      if (blocking.length > 0) {
        // The store's post list was behind the database. Ask again with what
        // the server reports rather than forcing past a warning never shown.
        askDelete(g, blocking);
        return;
      }

      s.ask(null);
      s.toast(err instanceof ApiClientError ? err.message : `Could not delete ${g.name}.`);
    } finally {
      inFlightDeletes.delete(g.id);
      setDeleting((d) => {
        const next = { ...d };
        delete next[g.id];
        return next;
      });
    }
  };

  /**
   * `blocking` is the server's list, passed only when a 409 has already come
   * back. Otherwise the posts on screen are what the dialog describes, and the
   * server gets the final say when the request goes out.
   */
  const askDelete = (g: Goal, blocking?: BlockingPost[]) => {
    const mine = s.postsForGoal(g.id);
    const scheduled =
      blocking ??
      mine
        .filter((p) => p.state === "scheduled")
        .map((p) => ({ id: p.id, scheduledAt: p.scheduledFor ?? null }));

    // Posts that are not scheduled detach too, but nothing about them changes
    // beyond losing the goal, so they are counted rather than listed.
    const kept = Math.max(mine.length - scheduled.length, 0);

    s.ask({
      title: `Delete ${g.name}?`,
      body: scheduled.length
        ? `The goal stops running. ${scheduled.length} scheduled ${scheduled.length === 1 ? "post" : "posts"} ` +
          `${scheduled.length === 1 ? "stays" : "stay"} in the queue and will still publish, but with no goal ` +
          `behind ${scheduled.length === 1 ? "it" : "them"}.`
        : kept > 0
          ? `The goal stops running. The ${kept} post${kept === 1 ? "" : "s"} it already produced ` +
            `${kept === 1 ? "stays" : "stay"} in the queue, detached from it.`
          : "The goal stops running. It has produced no posts.",
      items: scheduled
        .slice(0, 5)
        .map((p) => ({ label: p.scheduledAt ? `${p.id} — ${absDT(p.scheduledAt)}` : p.id })),
      actionLabel: scheduled.length ? "Delete and detach posts" : "Delete goal",
      border: "1px solid var(--red)",
      bg: "var(--surface)",
      fg: "var(--red)",
      run: () => void runDelete(g, scheduled.length > 0),
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <p style={{ margin: 0, fontSize: 13, color: "var(--fg2)" }}>
          A goal is a standing intent. It runs on its cadence and drops posts into the queue as drafts.
        </p>
        <span style={{ flex: "1 1 auto" }} />
        <button type="button" onClick={newGoal} style={{ padding: "7px 13px", border: 0, borderRadius: "var(--r3)", background: "var(--green)", color: "var(--on-green)", fontSize: 13, fontWeight: 600 }}>
          New goal
        </button>
      </div>

      {s.goals.length === 0 ? (
        <EmptyState
          title="No goals yet"
          body="A goal carries the prompts, platforms, cadence and assets a run needs. Everything else in the workspace follows from one."
          actionLabel="Create a goal"
          onAction={newGoal}
        />
      ) : (
      <div style={{ overflowX: "auto", borderTop: "1px solid var(--border-strong)" }}>
        <table style={{ width: "100%", minWidth: 1020, fontSize: 13 }}>
          <thead>
            <tr>
              {HEADERS.map((h, i) => (
                <th key={i} scope="col" style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)", textAlign: h.align, fontSize: 12, fontWeight: 500, color: "var(--fg2)", whiteSpace: "nowrap" }}>
                  {h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {s.goals.map((g) => {
              const list = s.postsForGoal(g.id);
              const pill = PILL[SPILL[g.status]];
              const last = list.map((p) => p.updatedAt).sort().pop();
              const ig = g.platforms.includes("instagram");
              const li = g.platforms.includes("linkedin");

              const actions = [
                {
                  label: g.status === "active" ? "Pause" : "Resume",
                  icon: g.status === "active" ? (
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" stroke="none" aria-hidden style={{ flexShrink: 0 }}>
                      <rect x="6" y="4" width="4" height="16" rx="1" />
                      <rect x="14" y="4" width="4" height="16" rx="1" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" stroke="none" aria-hidden style={{ flexShrink: 0 }}>
                      <path d="M6 4l14 8-14 8V4z" />
                    </svg>
                  ),
                  br: "var(--border)",
                  fg: "var(--fg2)",
                  run: () => {
                    const next = g.status === "active" ? "paused" : "active";
                    s.setGoals((gs) => gs.map((x) => (x.id === g.id ? { ...x, status: next } : x)));
                    s.toast(g.name + (next === "active" ? " resumed" : " paused"));
                  },
                },
                {
                  label: "Duplicate",
                  icon: (
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>
                      <rect x="9" y="9" width="11" height="11" rx="2" />
                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                    </svg>
                  ),
                  br: "var(--border)",
                  fg: "var(--fg2)",
                  run: () => {
                    s.setGoals((gs) => [...gs, { ...g, id: "GOL-" + String(gs.length + 1).padStart(2, "0"), name: g.name + " (copy)" }]);
                    s.toast("Goal duplicated");
                  },
                },
                {
                  label: "Run now",
                  icon: (
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" stroke="none" aria-hidden style={{ flexShrink: 0 }}>
                      <path d="M6 4l14 8-14 8V4z" />
                    </svg>
                  ),
                  br: "var(--green-line)",
                  fg: "var(--green-text)",
                  run: () => s.toast("Run queued for " + g.name),
                },
                {
                  label: "Delete",
                  icon: (
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>
                      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6" />
                    </svg>
                  ),
                  br: "var(--red-br)",
                  fg: "var(--red)",
                  run: () => askDelete(g),
                },
              ];

              const busy = !!deleting[g.id];

              return (
                <tr key={g.id} style={{ borderBottom: "1px solid var(--border)", opacity: busy ? 0.55 : 1 }}>
                  <td style={{ padding: 10 }}>
                    <button type="button" onClick={() => s.go(`/goals/${g.id}`)} style={{ border: 0, background: "transparent", padding: 0, textAlign: "left", fontSize: 13, fontWeight: 500, color: "var(--fg)" }}>
                      {g.name}
                    </button>
                  </td>
                  <td style={{ padding: 10 }}>
                    <span style={{ display: "inline-flex", gap: 4, fontSize: 11, fontWeight: 600 }}>
                      <span title={ig ? "Instagram — targeted" : "Instagram — not targeted"} style={{ padding: "1px 5px", borderRadius: "var(--r2)", border: "1px solid var(--border)", color: ig ? "var(--fg)" : "var(--fg3)", opacity: ig ? 1 : 0.4 }}>IG</span>
                      <span title={li ? "LinkedIn — targeted" : "LinkedIn — not targeted"} style={{ padding: "1px 5px", borderRadius: "var(--r2)", border: "1px solid var(--border)", color: li ? "var(--fg)" : "var(--fg3)", opacity: li ? 1 : 0.4 }}>LI</span>
                    </span>
                  </td>
                  <td style={{ padding: 10, color: "var(--fg2)" }}>{CAD[g.schedule.cadence]} · {g.schedule.time}</td>
                  <td style={{ padding: 10, color: "var(--fg2)", whiteSpace: "nowrap" }}>
                    {absDT(g.startDate).split(",")[0]} – {g.endDate ? absDT(g.endDate).split(",")[0] : "until paused"}
                  </td>
                  <td style={{ padding: 10, textAlign: "right", fontFamily: MONO, fontSize: 12 }}>{list.length}</td>
                  {/*
                    Tokens and spend come from the usage ledger, keyed by goal.
                    Summing the posts' own columns counted caption calls only,
                    so a goal's image spend never appeared in this table.
                  */}
                  <td style={{ padding: 10, textAlign: "right", fontFamily: MONO, fontSize: 12, whiteSpace: "nowrap" }}>
                    {num(usageForGoal(g.id)?.tokens ?? 0)}
                  </td>
                  <td style={{ padding: 10, textAlign: "right", fontFamily: MONO, fontSize: 12, whiteSpace: "nowrap" }}>
                    {(() => {
                      const c = usageForGoal(g.id)?.costInr;
                      return c == null ? (
                        <span style={{ color: "var(--fg3)" }}>not priced</span>
                      ) : (
                        <>
                          <span style={{ color: "var(--fg3)" }}>est.</span> {inrCost(c)}
                        </>
                      );
                    })()}
                  </td>
                  <td style={{ padding: 10 }}>
                    <span style={{ display: "inline-block", fontSize: 11, padding: "2px 8px", borderRadius: 999, background: pill.bg, color: pill.fg, border: `1px solid ${pill.br}` }}>
                      {g.status[0].toUpperCase() + g.status.slice(1)}
                    </span>
                  </td>
                  <td style={{ padding: 10, color: "var(--fg2)", fontSize: 12, whiteSpace: "nowrap" }}>{last ? relDT(last, now) : "never"}</td>
                  <td style={{ padding: 10 }}>
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      {actions.map((a) => (
                        <button
                          key={a.label}
                          type="button"
                          onClick={a.run}
                          disabled={busy}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            padding: "4px 9px",
                            border: `1px solid ${a.br}`,
                            borderRadius: "var(--r2)",
                            background: "var(--surface)",
                            color: a.fg,
                            fontSize: 11,
                            fontWeight: 500,
                            cursor: busy ? "default" : "pointer",
                          }}
                        >
                          {a.icon}
                          <span>{a.label}</span>
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}
