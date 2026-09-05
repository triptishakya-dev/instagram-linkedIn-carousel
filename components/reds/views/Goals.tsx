"use client";

import { PILL } from "@/lib/reds/data";
import { MONO, absDT, inr, relDT } from "@/lib/reds/format";
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

const HEADERS: { label: string; align: "left" | "right" }[] = [
  { label: "Name", align: "left" },
  { label: "Platforms", align: "left" },
  { label: "Cadence", align: "left" },
  { label: "Window", align: "left" },
  { label: "Posts", align: "right" },
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

  const newGoal = () => {
    s.setGoalDraft(null);
    s.setGoalTouched({});
    s.go("/goals/new");
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
                  br: "var(--border)",
                  fg: "var(--fg2)",
                  run: () => {
                    s.setGoals((gs) => [...gs, { ...g, id: "GOL-" + String(gs.length + 1).padStart(2, "0"), name: g.name + " (copy)" }]);
                    s.toast("Goal duplicated");
                  },
                },
                { label: "Run now", br: "var(--green-line)", fg: "var(--green-text)", run: () => s.toast("Run queued for " + g.name) },
                {
                  label: "Delete",
                  br: "var(--red-br)",
                  fg: "var(--red)",
                  run: () =>
                    s.ask({
                      title: "Delete " + g.name + "?",
                      body: "The goal stops running. Posts it already produced stay in the queue.",
                      items: [],
                      actionLabel: "Delete goal",
                      border: "1px solid var(--red)",
                      bg: "var(--surface)",
                      fg: "var(--red)",
                      run: () => {
                        s.setGoals((gs) => gs.filter((x) => x.id !== g.id));
                        s.ask(null);
                        s.toast("Goal deleted");
                      },
                    }),
                },
              ];

              return (
                <tr key={g.id} style={{ borderBottom: "1px solid var(--border)" }}>
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
                  <td style={{ padding: 10, textAlign: "right", fontFamily: MONO, fontSize: 12, whiteSpace: "nowrap" }}>
                    <span style={{ color: "var(--fg3)" }}>est.</span> {inr(list.reduce((a, p) => a + p.usage.estimatedCostInr, 0))}
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
                        <button key={a.label} type="button" onClick={a.run} style={{ padding: "4px 9px", border: `1px solid ${a.br}`, borderRadius: "var(--r2)", background: "var(--surface)", color: a.fg, fontSize: 11 }}>
                          {a.label}
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
