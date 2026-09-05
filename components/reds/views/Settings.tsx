"use client";

import { useEffect, useState } from "react";
import { MONO } from "@/lib/reds/format";
import { useReds, type Settings as SettingsShape } from "../store";

const NAV_S: [string, string][] = [
  ["workspace", "Workspace"],
  ["integrations", "Integrations"],
  ["brand", "Brand defaults"],
  ["generation", "Generation defaults"],
  ["notifications", "Notifications"],
  ["team", "Team"],
  ["danger", "Danger zone"],
];

const NOTIF: [string, string][] = [
  ["failed", "Generation failed"],
  ["published", "Post published"],
  ["budget", "Budget threshold reached"],
  ["expiry", "Access token expiring"],
];

const DANGER = [
  { k: "drafts", label: "Delete all drafts", desc: "Removes every post in the draft state. Scheduled and published posts are untouched.", phrase: "delete all drafts", action: "Delete drafts" },
  { k: "disconnect", label: "Disconnect all platforms", desc: "Instagram and LinkedIn both drop. Scheduled posts will fail until reconnected.", phrase: "disconnect all platforms", action: "Disconnect all" },
  { k: "reset", label: "Reset workspace", desc: "Clears goals, posts, assets and saved views. Nothing is recoverable.", phrase: "reset workspace", action: "Reset workspace" },
];

const H2: React.CSSProperties = { margin: "0 0 14px", fontSize: 20, fontWeight: 600, lineHeight: 1.35 };
const FIELD: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "var(--fg2)" };
const SELECT: React.CSSProperties = {
  padding: "8px 10px", border: "1px solid var(--border)", borderRadius: "var(--r3)",
  background: "var(--surface)", fontSize: 13, color: "var(--fg)", maxWidth: 280,
};

export function Settings() {
  const s = useReds();
  const st = s.settings;
  const put = (patch: Partial<SettingsShape>) => s.setSettings((x) => ({ ...x, ...patch }));

  const [active, setActive] = useState("workspace");
  const [inviteDraft, setInviteDraft] = useState("");
  const [dangerDrafts, setDangerDrafts] = useState<Record<string, string>>({});

  // Scroll-spy over the settings sections, driven by the scrolling <main>.
  useEffect(() => {
    const main = document.getElementById("reds-main");
    const onScroll = () => {
      let cur = NAV_S[0][0];
      NAV_S.forEach(([id]) => {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= 160) cur = id;
      });
      setActive((a) => (a === cur ? a : cur));
    };
    main?.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      main?.removeEventListener("scroll", onScroll);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  const workspace = [
    { label: "Workspace name", kind: "text" as const, value: st.wsName, set: (v: string) => put({ wsName: v }) },
    { label: "Timezone", kind: "select" as const, value: st.timezone, opts: ["Asia/Kolkata (IST)", "Asia/Dubai (GST)", "Europe/London (BST)"], set: (v: string) => put({ timezone: v }) },
    { label: "Date format", kind: "select" as const, value: st.dateFormat, opts: ["DD MMM YYYY", "YYYY-MM-DD", "MMM D, YYYY"], set: (v: string) => put({ dateFormat: v }) },
    { label: "Currency", kind: "select" as const, value: st.currency, opts: ["INR (₹)", "USD ($)", "AED (د.إ)"], set: (v: string) => put({ currency: v }) },
  ];

  const integrations = [
    { plat: "Instagram", state: "Connected", ratio: st.igRatio, ratios: ["4:5", "1:1"], slides: st.igSlides, first: true },
    { plat: "LinkedIn", state: "Token expiring", ratio: st.liRatio, ratios: ["1:1", "1.91:1"], slides: st.liSlides, first: false },
  ];

  const generation = [
    { label: "Default caption model", kind: "select" as const, value: st.defCaptionModel, opts: s.models.map((m) => ({ v: m.id, label: m.label })), set: (v: string) => put({ defCaptionModel: v }) },
    { label: "Default slide model", kind: "select" as const, value: st.defSlideModel, opts: s.models.map((m) => ({ v: m.id, label: m.label })), set: (v: string) => put({ defSlideModel: v }) },
    { label: "Default regeneration scope", kind: "select" as const, value: st.defScope, opts: [{ v: "slide", label: "This slide" }, { v: "all", label: "All slides" }, { v: "caption", label: "Caption only" }], set: (v: string) => put({ defScope: v }) },
    { label: "Confirm bulk regenerate above ₹", kind: "number" as const, value: String(st.bulkThreshold), set: (v: string) => put({ bulkThreshold: Number(v) }) },
  ];

  const logoOpts = s.assets.filter((a) => a.kind === "logo");
  const logoId = st.logoId || logoOpts[0]?.id || "";

  const goSection = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    const el = document.getElementById(id);
    const main = document.getElementById("reds-main");
    if (el && main && main.scrollHeight > main.clientHeight) {
      e.preventDefault();
      main.scrollTo({
        top: main.scrollTop + el.getBoundingClientRect().top - main.getBoundingClientRect().top - 12,
        behavior: "smooth",
      });
    }
    setActive(id);
  };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 32, alignItems: "flex-start" }}>
      <nav aria-label="Settings sections" style={{ flex: "0 0 180px", position: "sticky", top: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        {NAV_S.map(([id, label]) => {
          const on = active === id;
          const danger = id === "danger";
          return (
            <a
              key={id}
              href={"#" + id}
              onClick={(e) => goSection(e, id)}
              aria-current={on ? "true" : "false"}
              style={{
                padding: "6px 10px",
                borderLeft: `2px solid ${on ? (danger ? "var(--red)" : "var(--green)") : "var(--border)"}`,
                borderRadius: "0 var(--r2) var(--r2) 0",
                background: on ? (danger ? "var(--red-bg)" : "var(--green-tint)") : "transparent",
                color: on ? (danger ? "var(--red)" : "var(--green-text)") : danger ? "var(--red)" : "var(--fg2)",
                fontSize: 13,
                fontWeight: on ? 600 : 400,
                textDecoration: "none",
              }}
            >
              {label}
            </a>
          );
        })}
      </nav>

      <div style={{ flex: "1 1 560px", maxWidth: 640, display: "flex", flexDirection: "column", gap: 36 }}>
        {/* ---- workspace ---- */}
        <section id="workspace">
          <h2 style={H2}>Workspace</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {workspace.map((f) => (
              <label key={f.label} style={FIELD}>
                {f.label}
                {f.kind === "select" ? (
                  <select value={f.value} onChange={(e) => f.set(e.target.value)} style={SELECT}>
                    {f.opts!.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                ) : (
                  <input value={f.value} onChange={(e) => f.set(e.target.value)} style={{ ...SELECT, background: "var(--surface)" }} />
                )}
              </label>
            ))}
          </div>
        </section>

        {/* ---- integrations ---- */}
        <section id="integrations">
          <h2 style={{ ...H2, marginBottom: 4 }}>Integrations</h2>
          <p style={{ margin: "0 0 14px", fontSize: 12, color: "var(--fg2)" }}>
            Connection state lives in Accounts. These are the posting defaults.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {integrations.map((i) => {
              const warn = i.state !== "Connected";
              return (
                <div key={i.plat} style={{ padding: 14, border: "1px solid var(--border)", borderRadius: "var(--r4)", background: "var(--surface)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    <strong style={{ fontSize: 14, fontWeight: 600 }}>{i.plat}</strong>
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: warn ? "var(--amber-bg)" : "var(--green-tint)", color: warn ? "var(--amber)" : "var(--green-text)", border: `1px solid ${warn ? "var(--amber-br)" : "var(--green-tint2)"}` }}>
                      {i.state}
                    </span>
                    <span style={{ flex: "1 1 auto" }} />
                    <button type="button" onClick={() => s.toast(i.plat + " authorisation refreshed")} style={{ padding: "5px 11px", border: "1px solid var(--border)", borderRadius: "var(--r3)", background: "var(--surface)", color: "var(--fg2)", fontSize: 12 }}>
                      {warn ? "Reauthorise" : "Reconnect"}
                    </button>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
                    <label style={{ ...FIELD, gap: 4 }}>
                      Default ratio
                      <select
                        value={i.ratio}
                        onChange={(e) => put(i.plat === "Instagram" ? { igRatio: e.target.value } : { liRatio: e.target.value })}
                        style={{ padding: "6px 8px", border: "1px solid var(--border)", borderRadius: "var(--r3)", background: "var(--surface2)", fontSize: 12, color: "var(--fg)" }}
                      >
                        {i.ratios.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </label>
                    <label style={{ ...FIELD, gap: 4 }}>
                      Default slides
                      <input
                        type="number"
                        value={i.slides}
                        min={3}
                        max={20}
                        onChange={(e) => put(i.plat === "Instagram" ? { igSlides: Number(e.target.value) } : { liSlides: Number(e.target.value) })}
                        style={{ width: 90, padding: "6px 8px", border: "1px solid var(--border)", borderRadius: "var(--r3)", background: "var(--surface2)", fontFamily: MONO, fontSize: 12 }}
                      />
                    </label>
                    {i.first ? (
                      <label style={{ display: "flex", alignItems: "flex-end", gap: 8, fontSize: 12, color: "var(--fg2)", paddingBottom: 7 }}>
                        <input type="checkbox" checked={st.firstComment} onChange={() => put({ firstComment: !st.firstComment })} style={{ accentColor: "var(--green-line)" }} />
                        Hashtags in the first comment
                      </label>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ---- brand ---- */}
        <section id="brand">
          <h2 style={{ ...H2, marginBottom: 4 }}>Brand defaults</h2>
          <p style={{ margin: "0 0 14px", fontSize: 12, color: "var(--fg2)" }}>
            New goals inherit these. Changing them does not alter goals that already exist.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <label style={FIELD}>
              Default brand logo
              <select value={logoId} onChange={(e) => put({ logoId: e.target.value })} style={SELECT}>
                {logoOpts.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </label>
            {[
              { label: "Default caption prompt", value: st.captionPrompt, set: (v: string) => put({ captionPrompt: v }) },
              { label: "Default image prompt", value: st.imagePrompt, set: (v: string) => put({ imagePrompt: v }) },
            ].map((p) => (
              <label key={p.label} style={FIELD}>
                {p.label}
                <textarea
                  value={p.value}
                  onChange={(e) => p.set(e.target.value)}
                  rows={3}
                  style={{ width: "100%", padding: 10, border: "1px solid var(--border)", borderRadius: "var(--r3)", background: "var(--surface2)", color: "var(--fg)", fontFamily: MONO, fontSize: 12, lineHeight: 1.5, resize: "vertical" }}
                />
              </label>
            ))}
          </div>
        </section>

        {/* ---- generation ---- */}
        <section id="generation">
          <h2 style={H2}>Generation defaults</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
            {generation.map((g) => (
              <label key={g.label} style={FIELD}>
                {g.label}
                {g.kind === "select" ? (
                  <select value={g.value} onChange={(e) => g.set(e.target.value)} style={{ ...SELECT, maxWidth: "none" }}>
                    {g.opts!.map((o) => (
                      <option key={o.v} value={o.v}>{o.label}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="number"
                    value={g.value}
                    step={100}
                    onChange={(e) => g.set(e.target.value)}
                    style={{ width: 130, padding: "8px 10px", border: "1px solid var(--border)", borderRadius: "var(--r3)", background: "var(--surface)", fontFamily: MONO, fontSize: 13 }}
                  />
                )}
              </label>
            ))}
          </div>
        </section>

        {/* ---- notifications ---- */}
        <section id="notifications">
          <h2 style={H2}>Notifications</h2>
          <table style={{ width: "100%", fontSize: 13 }}>
            <thead>
              <tr>
                <th scope="col" style={{ padding: "6px 8px", textAlign: "left", fontSize: 12, fontWeight: 500, color: "var(--fg2)", borderBottom: "1px solid var(--border)" }}>Event</th>
                <th scope="col" style={{ padding: "6px 8px", textAlign: "center", fontSize: 12, fontWeight: 500, color: "var(--fg2)", borderBottom: "1px solid var(--border)", width: 80 }}>Email</th>
                <th scope="col" style={{ padding: "6px 8px", textAlign: "center", fontSize: 12, fontWeight: 500, color: "var(--fg2)", borderBottom: "1px solid var(--border)", width: 80 }}>In-app</th>
              </tr>
            </thead>
            <tbody>
              {NOTIF.map(([k, label]) => (
                <tr key={k} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: 8 }}>{label}</td>
                  <td style={{ padding: 8, textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={st.notif[k][0]}
                      aria-label={"Email me when " + label.toLowerCase()}
                      onChange={() => put({ notif: { ...st.notif, [k]: [!st.notif[k][0], st.notif[k][1]] } })}
                      style={{ accentColor: "var(--green-line)" }}
                    />
                  </td>
                  <td style={{ padding: 8, textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={st.notif[k][1]}
                      aria-label={"Notify in app when " + label.toLowerCase()}
                      onChange={() => put({ notif: { ...st.notif, [k]: [st.notif[k][0], !st.notif[k][1]] } })}
                      style={{ accentColor: "var(--green-line)" }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* ---- team ---- */}
        <section id="team">
          <h2 style={H2}>Team</h2>
          <ul style={{ listStyle: "none", margin: "0 0 14px", padding: 0, borderTop: "1px solid var(--border)" }}>
            {s.team.map((m, i) => (
              <li key={m.email} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 2px", borderBottom: "1px solid var(--border)" }}>
                <span aria-hidden style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--green-tint)", color: "var(--green-text)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600 }}>
                  {m.name.split(" ").map((x) => x[0]).join("")}
                </span>
                <span style={{ flex: "1 1 auto", minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13 }}>{m.name}</span>
                  <span style={{ display: "block", fontSize: 12, color: "var(--fg2)" }}>{m.email}</span>
                </span>
                <select
                  value={m.role}
                  aria-label={"Role for " + m.name}
                  onChange={(e) => s.setTeam((t) => t.map((y, k) => (k === i ? { ...y, role: e.target.value } : y)))}
                  style={{ padding: "5px 8px", border: "1px solid var(--border)", borderRadius: "var(--r3)", background: "var(--surface)", fontSize: 12, color: "var(--fg)" }}
                >
                  <option value="Owner">Owner</option>
                  <option value="Editor">Editor</option>
                  <option value="Viewer">Viewer</option>
                </select>
                <button
                  type="button"
                  onClick={() => { s.setTeam((t) => t.filter((_, k) => k !== i)); s.toast(m.name + " removed"); }}
                  style={{ padding: "4px 10px", border: "1px solid var(--border)", borderRadius: "var(--r3)", background: "var(--surface)", color: "var(--fg2)", fontSize: 12 }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              value={inviteDraft}
              onChange={(e) => setInviteDraft(e.target.value)}
              placeholder="name@reds.studio"
              aria-label="Invite by email"
              style={{ flex: "1 1 220px", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: "var(--r3)", background: "var(--surface)", fontSize: 13 }}
            />
            <button
              type="button"
              onClick={() => {
                const v = inviteDraft.trim();
                if (!v.includes("@")) { s.toast("That does not look like an email address"); return; }
                s.setTeam((t) => [...t, { name: v.split("@")[0], email: v, role: "Viewer" }]);
                setInviteDraft("");
                s.toast("Invite sent to " + v);
              }}
              style={{ padding: "8px 13px", border: "1px solid var(--green-line)", borderRadius: "var(--r3)", background: "var(--green-tint)", color: "var(--green-text)", fontSize: 13, fontWeight: 600 }}
            >
              Send invite
            </button>
          </div>
        </section>

        {/* ---- danger zone ---- */}
        <section id="danger" style={{ padding: 18, border: "1px solid var(--red-br)", borderRadius: "var(--r4)", background: "var(--red-bg)" }}>
          <h2 style={{ ...H2, marginBottom: 4, color: "var(--red)" }}>Danger zone</h2>
          <p style={{ margin: "0 0 16px", fontSize: 12, color: "var(--fg2)" }}>
            Each action needs its phrase typed exactly. None of it can be undone.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {DANGER.map((d) => {
              const v = dangerDrafts[d.k] || "";
              const ok = v.trim().toLowerCase() === d.phrase;
              return (
                <div key={d.k} style={{ paddingTop: 14, borderTop: "1px solid var(--red-br)" }}>
                  <strong style={{ display: "block", fontSize: 13, fontWeight: 600 }}>{d.label}</strong>
                  <span style={{ display: "block", fontSize: 12, color: "var(--fg2)", margin: "2px 0 8px" }}>{d.desc}</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                    <input
                      value={v}
                      onChange={(e) => setDangerDrafts((x) => ({ ...x, [d.k]: e.target.value }))}
                      placeholder={d.phrase}
                      aria-label={`Type “${d.phrase}” to confirm`}
                      style={{ flex: "1 1 200px", padding: "7px 10px", border: "1px solid var(--red-br)", borderRadius: "var(--r3)", background: "var(--surface)", fontFamily: MONO, fontSize: 12 }}
                    />
                    <button
                      type="button"
                      aria-disabled={!ok}
                      onClick={() => {
                        if (!ok) return;
                        if (d.k === "drafts") {
                          const n = s.posts.filter((p) => p.state === "draft").length;
                          s.setPosts((ps) => ps.filter((p) => p.state !== "draft"));
                          s.toast(n + " drafts deleted");
                        } else if (d.k === "disconnect") {
                          s.toast("All platforms disconnected");
                        } else {
                          s.toast("Workspace reset — reload restores the seeded data");
                        }
                        setDangerDrafts((x) => ({ ...x, [d.k]: "" }));
                      }}
                      style={{ padding: "7px 13px", border: "1px solid var(--red)", borderRadius: "var(--r3)", background: "var(--surface)", color: "var(--red)", fontSize: 12, fontWeight: 600, opacity: ok ? 1 : 0.45 }}
                    >
                      {d.action}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
