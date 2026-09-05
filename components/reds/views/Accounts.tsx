"use client";

import { useEffect, useState } from "react";
import { PILL } from "@/lib/reds/data";
import { MONO, absDT, inr, num } from "@/lib/reds/format";
import { seg, useReds } from "../store";
import type { Model, ModelRole, Platform } from "@/lib/reds/types";

const ROLES: { k: ModelRole; label: string }[] = [
  { k: "caption", label: "Caption" },
  { k: "slides", label: "Slides" },
  { k: "both", label: "Both" },
];

const CONNECTIONS: {
  plat: Platform;
  platform: string;
  handle: string;
  scopes: string;
  days: number;
  sync: string;
  avatar: string;
}[] = [
  { plat: "instagram", platform: "Instagram", handle: "@reds.studio", scopes: "content_publish · pages_read · insights", days: 41, sync: "synced 20 minutes ago", avatar: "var(--green-tint2)" },
  { plat: "linkedin", platform: "LinkedIn", handle: "REDS Studio", scopes: "w_organization_social · r_organization_admin", days: 5, sync: "synced 3 hours ago", avatar: "var(--k200)" },
];

export function Accounts() {
  const s = useReds();
  const [tab, setTab] = useState<"models" | "connections">("models");
  const [roleDefaults, setRoleDefaults] = useState<Record<ModelRole, string>>({
    caption: "mdl-haiku",
    slides: "mdl-sonnet",
    both: "mdl-sonnet",
  });

  useEffect(() => {
    fetch("/api/models")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.models && Array.isArray(data.models)) {
          s.setModels(
            data.models.map((m: any) => ({
              id: m.id,
              label: m.label,
              provider: m.provider,
              role: (m.role || "BOTH").toLowerCase() as ModelRole,
              inputPricePerMTokInr: m.inputPricePerMTokInr,
              outputPricePerMTokInr: m.outputPricePerMTokInr,
              maxTokens: m.maxTokens,
              temperature: m.temperature,
              enabled: m.enabled,
              keyLast4: m.keyLast4 || undefined,
            })),
          );
        }
      })
      .catch(() => {});
  }, []);

  const setVal = <K extends keyof Model>(id: string, k: K, v: Model[K]) => {
    s.setModels((ms) => ms.map((m) => (m.id === id ? { ...m, [k]: v } : m)));

    // Sync field change to PostgreSQL database
    const payloadKey =
      k === "inputPricePerMTokInr"
        ? "inputPricePerMTokInr"
        : k === "outputPricePerMTokInr"
          ? "outputPricePerMTokInr"
          : k === "role"
            ? "role"
            : k;

    const payloadValue = k === "role" ? (v as string).toUpperCase() : v;

    fetch(`/api/models/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [payloadKey]: payloadValue }),
    }).catch(() => {});
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

              return (
                <div key={m.id} style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16, border: "1px solid var(--border)", borderRadius: "var(--r4)", background: "var(--surface)" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <span style={{ flex: "1 1 auto", minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 14, fontWeight: 600 }}>{m.label}</span>
                      <span style={{ display: "block", fontSize: 12, color: "var(--fg2)" }}>{m.provider}</span>
                    </span>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--fg2)" }}>
                      <input type="checkbox" checked={m.enabled} onChange={() => setVal(m.id, "enabled", !m.enabled)} style={{ accentColor: "var(--green-line)" }} />
                      {m.enabled ? "Enabled" : "Disabled"}
                    </label>
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
          {CONNECTIONS.map((c) => {
            const soon = c.days <= 7;
            const pill = soon
              ? { bg: "var(--amber-bg)", fg: "var(--amber)", br: "var(--amber-br)" }
              : PILL.n;

            const actions = [
              { label: "Reconnect", br: "var(--border)", bg: "var(--surface)", fg: "var(--fg2)", weight: 400, run: () => s.toast(c.platform + " reconnected") },
              {
                label: "Disconnect",
                br: "var(--red-br)",
                bg: "var(--surface)",
                fg: "var(--red)",
                weight: 400,
                run: () =>
                  s.ask({
                    title: "Disconnect " + c.platform + "?",
                    body: `${scheduledCount(c.plat)} scheduled posts target ${c.platform}. They will fail at their scheduled time until the account is reconnected.`,
                    items: s.posts
                      .filter((p) => p.state === "scheduled" && p.platforms.includes(c.plat))
                      .slice(0, 5)
                      .map((p) => ({ label: p.id + " — " + absDT(p.scheduledFor) })),
                    actionLabel: "Disconnect",
                    border: "1px solid var(--red)",
                    bg: "var(--surface)",
                    fg: "var(--red)",
                    run: () => { s.ask(null); s.toast(c.platform + " disconnected"); },
                  }),
              },
            ];

            return (
              <li key={c.plat} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16, padding: "16px 2px", borderBottom: "1px solid var(--border)" }}>
                <span aria-hidden style={{ width: 40, height: 40, borderRadius: "50%", border: "1px solid var(--border-strong)", background: c.avatar }} />
                <span style={{ flex: "1 1 220px", minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 14, fontWeight: 500 }}>{c.platform}</span>
                  <span style={{ display: "block", fontSize: 12, color: "var(--fg2)" }}>{c.handle}</span>
                </span>
                <span style={{ flex: "1 1 200px", fontSize: 12, color: "var(--fg2)" }}>{c.scopes}</span>
                <span style={{ flex: "0 0 auto", fontSize: 11, padding: "2px 8px", borderRadius: 999, background: pill.bg, color: pill.fg, border: `1px solid ${pill.br}` }}>
                  {soon ? `Token expires in ${c.days} days` : `Token valid ${c.days} more days`}
                </span>
                <span style={{ flex: "0 0 auto", fontSize: 12, color: "var(--fg2)" }}>{c.sync}</span>
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
