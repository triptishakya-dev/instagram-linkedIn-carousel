"use client";

import { useEffect, useRef, useState } from "react";
import {
  ApiClientError,
  blockingGoalsOf,
  deleteModel,
  listModels,
  updateModel,
  type BlockingGoal,
  type DeleteModelResult,
} from "@/lib/api-client";
import { PILL } from "@/lib/reds/data";
import { MONO, absDT, inr, num } from "@/lib/reds/format";
import { toModelWirePatch, toRedsModel } from "@/lib/reds/map";
import { EmptyState } from "../charts";
import { seg, useReds } from "../store";
import type { Model, ModelRole, Platform } from "@/lib/reds/types";

const ROLES: { k: ModelRole; label: string }[] = [
  { k: "caption", label: "Caption" },
  { k: "slides", label: "Slides" },
  { k: "both", label: "Both" },
];

/** Platforms the product can post to. Account details arrive from OAuth. */
const PLATFORMS: { plat: Platform; label: string; avatar: string }[] = [
  { plat: "instagram", label: "Instagram", avatar: "var(--green-tint2)" },
  { plat: "linkedin", label: "LinkedIn", avatar: "var(--k200)" },
];

interface Connection {
  plat: Platform;
  handle: string;
  scopes: string;
  expiresInDays: number;
  syncedLabel: string;
}

export function Accounts() {
  const s = useReds();
  const [tab, setTab] = useState<"models" | "connections">("models");
  const [roleDefaults, setRoleDefaults] = useState<Record<ModelRole, string>>({
    caption: "",
    slides: "",
    both: "",
  });
  // Populated by OAuth; nothing is connected until the user authorises.
  const [connections] = useState<Connection[]>([]);

  /**
   * Deletes in flight, so a card can show its own progress.
   *
   * The ref is what actually guards against a double submit: the confirm
   * dialog stays open until the request lands, and a second click would
   * arrive before a state update could disable anything.
   */
  const deletingRef = useRef<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const ac = new AbortController();

    listModels(ac.signal)
      .then((rows) => s.setModels(rows.map(toRedsModel)))
      .catch(() => {
        /* the provider's own fetch already populated this; keep what is shown */
      });

    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setVal = <K extends keyof Model>(id: string, k: K, v: Model[K]) => {
    s.setModels((ms) => ms.map((m) => (m.id === id ? { ...m, [k]: v } : m)));

    updateModel(id, toModelWirePatch({ [k]: v } as Partial<Model>)).catch(() => {
      /* the next edit retries; a field on screen is not worth a modal */
    });
  };

  /**
   * Drops every local reference to a model the server has just deleted.
   *
   * The settings copy matters beyond tidiness: the provider saves the whole
   * settings blob back on any change, so a default left naming a deleted id
   * here would be written over the server's cleared value on the next edit.
   */
  const forgetModel = (id: string) => {
    s.setModels((ms) => ms.filter((m) => m.id !== id));
    s.setGoals((gs) => gs.map((g) => (g.modelId === id ? { ...g, modelId: "" } : g)));
    s.setSettings((st) => ({
      ...st,
      defCaptionModel: st.defCaptionModel === id ? "" : st.defCaptionModel,
      defSlideModel: st.defSlideModel === id ? "" : st.defSlideModel,
    }));
    setRoleDefaults((rd) => ({
      caption: rd.caption === id ? "" : rd.caption,
      slides: rd.slides === id ? "" : rd.slides,
      both: rd.both === id ? "" : rd.both,
    }));
  };

  const deleteSummary = (m: Model, r: DeleteModelResult) => {
    const also: string[] = [];
    if (r.clearedGoalCount > 0) {
      also.push(`cleared from ${r.clearedGoalCount} goal${r.clearedGoalCount === 1 ? "" : "s"}`);
    }
    if (r.clearedDefaults.length > 0) {
      const n = r.clearedDefaults.length;
      also.push(`${n} workspace default${n === 1 ? "" : "s"} reset`);
    }
    return also.length ? `${m.label} deleted — ${also.join(", ")}` : `${m.label} deleted`;
  };

  const runDelete = async (m: Model, force: boolean) => {
    if (deletingRef.current.has(m.id)) return;
    deletingRef.current.add(m.id);
    setDeleting((d) => ({ ...d, [m.id]: true }));

    try {
      const result = await deleteModel(m.id, { force });
      s.ask(null);
      forgetModel(m.id);
      s.toast(deleteSummary(m, result));
    } catch (err) {
      const blocking = blockingGoalsOf(err);

      if (blocking.length > 0) {
        // The store's goal list was behind the database — a goal was pointed
        // at this model elsewhere. Ask again with what the server reports
        // rather than forcing past a warning the user never saw.
        askDelete(m, blocking);
        return;
      }

      s.ask(null);
      s.toast(
        err instanceof ApiClientError ? err.message : `Could not delete ${m.label}.`,
      );
    } finally {
      deletingRef.current.delete(m.id);
      setDeleting((d) => {
        const next = { ...d };
        delete next[m.id];
        return next;
      });
    }
  };

  /**
   * `blocking` is the server's list, passed only when a 409 has already come
   * back. Otherwise the goals on screen are what the dialog describes, and the
   * server gets the final say when the request goes out.
   */
  const askDelete = (m: Model, blocking?: BlockingGoal[]) => {
    const active =
      blocking ??
      s.goals
        .filter((g) => g.modelId === m.id && g.status === "active")
        .map((g) => ({ id: g.id, name: g.name }));

    // Paused and ended goals lose the reference too. They do not block the
    // delete, so they are counted rather than listed.
    const idle = s.goals.filter((g) => g.modelId === m.id && g.status !== "active").length;

    const tail = "Cost estimates computed from its pricing go with it, and this cannot be undone.";

    s.ask({
      title: `Delete ${m.label}?`,
      body: active.length
        ? `${active.length} active ${active.length === 1 ? "goal uses" : "goals use"} this model. ` +
          `Deleting it leaves ${active.length === 1 ? "that goal" : "those goals"} with no model until ` +
          `you pick another, so ${active.length === 1 ? "its" : "their"} next scheduled run will not ` +
          `generate. ${tail}`
        : idle > 0
          ? `${idle} paused or ended goal${idle === 1 ? "" : "s"} still name${idle === 1 ? "s" : ""} ` +
            `this model; the reference is cleared. ${tail}`
          : `The model is removed from this workspace. ${tail}`,
      items: active.slice(0, 6).map((g) => ({ label: g.name })),
      actionLabel: active.length ? "Delete and clear goals" : "Delete model",
      border: "1px solid var(--red)",
      bg: "var(--surface)",
      fg: "var(--red)",
      run: () => void runDelete(m, active.length > 0),
    });
  };

  const scheduledCount = (plat: Platform) =>
    s.posts.filter((p) => p.state === "scheduled" && p.platforms.includes(plat)).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div role="tablist" aria-label="Accounts sections" style={{ display: "flex", gap: 18, borderBottom: "1px solid var(--border)" }}>
        {(["models", "connections"] as const).map((t) => {
          const on = tab === t;
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setTab(t)}
              style={{ border: 0, background: "transparent", padding: "8px 0 10px", borderBottom: `2px solid ${on ? "var(--green)" : "transparent"}`, color: on ? "var(--fg)" : "var(--fg2)", fontSize: 13, fontWeight: on ? 600 : 400 }}
            >
              {t === "models" ? "Models" : "Connections"}
            </button>
          );
        })}
      </div>

      {/* ---- models ---- */}
      {tab === "models" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {s.models.length === 0 ? (
            <EmptyState
              title="No models configured"
              body="Add a provider model with its pricing and a key. Goals pick from this list, and every cost estimate in the product is computed from it."
            />
          ) : null}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(330px,1fr))", gap: 16 }}>
            {s.models.map((m) => {
              const mine = s.posts.filter((p) => p.usage.modelId === m.id);
              const avgIn = mine.length ? mine.reduce((a, p) => a + p.usage.inputTokens, 0) / mine.length : 4200;
              const avgOut = mine.length ? mine.reduce((a, p) => a + p.usage.outputTokens, 0) / mine.length : 1800;
              const perPost = (avgIn / 1e6) * m.inputPricePerMTokInr + (avgOut / 1e6) * m.outputPricePerMTokInr;

              const fields = [
                { label: "Max tokens", value: m.maxTokens, step: 50, set: (v: number) => setVal(m.id, "maxTokens", v) },
                { label: "Input ₹ / M tok", value: m.inputPricePerMTokInr, step: 10, set: (v: number) => setVal(m.id, "inputPricePerMTokInr", v) },
                { label: "Output ₹ / M tok", value: m.outputPricePerMTokInr, step: 10, set: (v: number) => setVal(m.id, "outputPricePerMTokInr", v) },
              ];

              const busy = !!deleting[m.id];

              return (
                <div key={m.id} style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16, border: "1px solid var(--border)", borderRadius: "var(--r4)", background: "var(--surface)", opacity: busy ? 0.55 : 1 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <span style={{ flex: "1 1 auto", minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 14, fontWeight: 600 }}>{m.label}</span>
                      <span style={{ display: "block", fontSize: 12, color: "var(--fg2)" }}>{m.provider}</span>
                    </span>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--fg2)" }}>
                      <input type="checkbox" checked={m.enabled} disabled={busy} onChange={() => setVal(m.id, "enabled", !m.enabled)} style={{ accentColor: "var(--green-line)" }} />
                      {m.enabled ? "Enabled" : "Disabled"}
                    </label>
                    <button
                      type="button"
                      onClick={() => askDelete(m)}
                      disabled={busy}
                      aria-label={"Delete " + m.label}
                      title={busy ? "Deleting…" : "Delete " + m.label}
                      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto", width: 28, height: 28, padding: 0, border: "1px solid var(--red-br)", borderRadius: "var(--r2)", background: "var(--surface)", color: "var(--red)", cursor: busy ? "default" : "pointer" }}
                    >
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6" />
                      </svg>
                    </button>
                  </div>

                  <div>
                    <span style={{ display: "block", fontSize: 12, color: "var(--fg2)", marginBottom: 6 }}>Role</span>
                    <div role="group" aria-label={"Role for " + m.label} style={{ display: "flex", gap: 2, padding: 2, border: "1px solid var(--border)", borderRadius: "var(--r3)", background: "var(--surface2)" }}>
                      {ROLES.map((r) => {
                        const on = m.role === r.k;
                        const c = seg(on);
                        return (
                          <button key={r.k} type="button" aria-pressed={on} onClick={() => setVal(m.id, "role", r.k)} style={{ flex: "1 1 0", border: 0, borderRadius: "var(--r2)", padding: "4px 8px", fontSize: 12, background: c.bg, color: c.fg }}>
                            {r.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                    {fields.map((f) => (
                      <label key={f.label} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--fg2)" }}>
                        {f.label}
                        <input
                          type="number"
                          value={f.value}
                          step={f.step}
                          onChange={(e) => f.set(Number(e.target.value))}
                          style={{ width: 112, padding: "6px 8px", border: "1px solid var(--border)", borderRadius: "var(--r3)", background: "var(--surface2)", fontFamily: MONO, fontSize: 12 }}
                        />
                      </label>
                    ))}
                  </div>

                  <div>
                    <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "var(--fg2)" }}>
                      Temperature
                      <input type="range" min={0} max={1} step={0.05} value={m.temperature} onChange={(e) => setVal(m.id, "temperature", Number(e.target.value))} style={{ flex: "1 1 auto", accentColor: "var(--green-line)" }} />
                      <span style={{ fontFamily: MONO }}>{Number(m.temperature).toFixed(2)}</span>
                    </label>
                  </div>

                  <div style={{ paddingTop: 10, borderTop: "1px solid var(--border)", display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontFamily: MONO, fontSize: 16 }}>est. {inr(perPost)}</span>
                    <span style={{ fontSize: 12, color: "var(--fg2)" }}>est. per post at {num(avgIn + avgOut)} average tokens</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-end", paddingTop: 6 }}>
            {ROLES.map((r) => (
              <label key={r.k} style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "var(--fg2)" }}>
                Default for {r.label.toLowerCase()}
                <select
                  value={roleDefaults[r.k]}
                  onChange={(e) => setRoleDefaults((x) => ({ ...x, [r.k]: e.target.value }))}
                  style={{ padding: "7px 9px", border: "1px solid var(--border)", borderRadius: "var(--r3)", background: "var(--surface)", fontSize: 13, color: "var(--fg)" }}
                >
                  <option value="">None selected</option>
                  {s.models.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              </label>
            ))}
            <button
              type="button"
              onClick={() =>
                s.setNewModel({ label: "", provider: "Anthropic", key: "", role: "both", maxTokens: 1000, temperature: 0.7, inPrice: 268, outPrice: 1340, enabled: true })
              }
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", border: 0, borderRadius: "var(--r3)", background: "var(--green)", color: "var(--on-green)", fontSize: 13, fontWeight: 600 }}
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden>
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add model
            </button>
          </div>
        </div>
      ) : null}

      {/* ---- connections ---- */}
      {tab === "connections" ? (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, borderTop: "1px solid var(--border-strong)" }}>
          {PLATFORMS.map((p) => {
            const c = connections.find((x) => x.plat === p.plat);
            const soon = !!c && c.expiresInDays <= 7;
            const pill = !c
              ? PILL.n
              : soon
                ? { bg: "var(--amber-bg)", fg: "var(--amber)", br: "var(--amber-br)" }
                : PILL.n;

            const actions = c
              ? [
                  { label: "Reconnect", br: "var(--border)", bg: "var(--surface)", fg: "var(--fg2)", weight: 400, run: () => s.toast(p.label + " reconnected") },
                  {
                    label: "Disconnect",
                    br: "var(--red-br)",
                    bg: "var(--surface)",
                    fg: "var(--red)",
                    weight: 400,
                    run: () =>
                      s.ask({
                        title: "Disconnect " + p.label + "?",
                        body: `${scheduledCount(p.plat)} scheduled posts target ${p.label}. They will fail at their scheduled time until the account is reconnected.`,
                        items: s.posts
                          .filter((x) => x.state === "scheduled" && x.platforms.includes(p.plat))
                          .slice(0, 5)
                          .map((x) => ({ label: x.id + " — " + absDT(x.scheduledFor) })),
                        actionLabel: "Disconnect",
                        border: "1px solid var(--red)",
                        bg: "var(--surface)",
                        fg: "var(--red)",
                        run: () => { s.ask(null); s.toast(p.label + " disconnected"); },
                      }),
                  },
                ]
              : [
                  { label: "Connect", br: "var(--green-line)", bg: "var(--green-tint)", fg: "var(--green-text)", weight: 600, run: () => s.toast("Authorisation for " + p.label + " is not wired yet") },
                ];

            return (
              <li key={p.plat} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16, padding: "16px 2px", borderBottom: "1px solid var(--border)" }}>
                <span aria-hidden style={{ width: 40, height: 40, borderRadius: "50%", border: "1px solid var(--border-strong)", background: c ? p.avatar : "var(--sunken)" }} />
                <span style={{ flex: "1 1 220px", minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 14, fontWeight: 500 }}>{p.label}</span>
                  <span style={{ display: "block", fontSize: 12, color: "var(--fg2)" }}>{c ? c.handle : "No account linked"}</span>
                </span>
                <span style={{ flex: "1 1 200px", fontSize: 12, color: "var(--fg2)" }}>{c ? c.scopes : "—"}</span>
                <span style={{ flex: "0 0 auto", fontSize: 11, padding: "2px 8px", borderRadius: 999, background: pill.bg, color: pill.fg, border: `1px solid ${pill.br}` }}>
                  {!c
                    ? "Not connected"
                    : soon
                      ? `Token expires in ${c.expiresInDays} days`
                      : `Token valid ${c.expiresInDays} more days`}
                </span>
                <span style={{ flex: "0 0 auto", fontSize: 12, color: "var(--fg2)" }}>{c ? c.syncedLabel : "never synced"}</span>
                <span style={{ flex: "0 0 auto", display: "flex", gap: 8 }}>
                  {actions.map((a) => (
                    <button key={a.label} type="button" onClick={a.run} style={{ padding: "5px 11px", border: `1px solid ${a.br}`, borderRadius: "var(--r3)", background: a.bg, color: a.fg, fontSize: 12, fontWeight: a.weight }}>
                      {a.label}
                    </button>
                  ))}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
