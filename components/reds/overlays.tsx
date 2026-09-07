"use client";

import { useState } from "react";
import { PILL, STATES, TINTS } from "@/lib/reds/data";
import { MONO, absDT, fmtBytes, inr, iso } from "@/lib/reds/format";
import { CURRENT_USER, useReds, seg } from "./store";
import type { Asset, Model, ModelRole } from "@/lib/reds/types";

const SCRIM: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 80,
  background: "rgba(33,33,33,.46)",
  display: "flex",
};

const PANEL: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--r5)",
  boxShadow: "var(--shadow)",
  overflow: "hidden",
};

export function Overlays() {
  return (
    <>
      <NewModelModal />
      <UploadModal />
      <AssetPicker />
      <AssetDrawer />
      <ConfirmDialog />
      <Palette />
      <GenerateSheet />
      <Toasts />
    </>
  );
}

/* ------------------------------------------------------------------ palette */

function Palette() {
  const s = useReds();
  if (!s.palette) return null;

  const q = s.q.toLowerCase();
  const results = [
    {
      label: "Posts",
      items: s.posts
        .filter((p) => (p.id + " " + p.slides[0].headline).toLowerCase().includes(q))
        .slice(0, 5)
        .map((p) => ({ key: p.id, label: p.slides[0].headline, href: `/posts/${p.id}` })),
    },
    {
      label: "Goals",
      items: s.goals
        .filter((g) => g.name.toLowerCase().includes(q))
        .slice(0, 4)
        .map((g) => ({ key: g.id, label: g.name, href: `/goals/${g.id}` })),
    },
    {
      label: "Assets",
      items: s.assets
        .filter((a) => a.name.toLowerCase().includes(q))
        .slice(0, 4)
        .map((a) => ({ key: a.id, label: a.name, href: "/assets" })),
    },
  ].filter((g) => g.items.length);

  const noResults = s.q.length > 0 && results.length === 0;

  return (
    <div role="dialog" aria-label="Search" style={{ ...SCRIM, alignItems: "flex-start", justifyContent: "center", paddingTop: "12vh" }}>
      <div style={{ ...PANEL, width: "min(620px,92vw)" }}>
        <input
          autoFocus
          value={s.q}
          onChange={(e) => s.setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && results[0]?.items[0]) s.go(results[0].items[0].href);
            if (e.key === "Escape") s.setPalette(false);
          }}
          placeholder="Search posts, goals, assets"
          aria-label="Search posts, goals and assets"
          style={{ width: "100%", padding: "14px 16px", border: 0, borderBottom: "1px solid var(--border)", background: "transparent", fontSize: 15 }}
        />
        <div style={{ maxHeight: "52vh", overflowY: "auto", padding: 8 }}>
          {results.map((g) => (
            <div key={g.label} style={{ padding: "6px 8px 10px" }}>
              <div style={{ fontSize: 12, color: "var(--fg3)", paddingBottom: 4 }}>{g.label}</div>
              {g.items.map((i) => (
                <button
                  key={i.key}
                  type="button"
                  onClick={() => s.go(i.href)}
                  style={{ display: "flex", alignItems: "baseline", gap: 10, width: "100%", border: 0, background: "transparent", borderRadius: "var(--r2)", padding: "6px 8px", textAlign: "left", fontSize: 13, color: "var(--fg)" }}
                >
                  <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--fg3)" }}>{i.key}</span>
                  {i.label}
                </button>
              ))}
            </div>
          ))}
          {noResults ? (
            <p style={{ margin: 0, padding: "20px 12px", fontSize: 13, color: "var(--fg2)" }}>Nothing matches “{s.q}”.</p>
          ) : null}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 14px", borderTop: "1px solid var(--border)", fontSize: 11, color: "var(--fg3)" }}>
          <span>Enter opens the first result</span>
          <button type="button" onClick={() => { s.setPalette(false); s.setQ(""); }} style={{ border: 0, background: "transparent", color: "var(--fg3)", fontSize: 11, padding: 0 }}>
            Esc to close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ generate sheet */

function GenerateSheet() {
  const s = useReds();
  if (!s.sheet) return null;

  return (
    <div role="dialog" aria-label="Generate now" style={{ ...SCRIM, justifyContent: "flex-end" }}>
      <div style={{ width: "min(460px,94vw)", height: "100%", background: "var(--surface)", borderLeft: "1px solid var(--border)", boxShadow: "var(--shadow)", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Generate now</h2>
          <span style={{ flex: "1 1 auto" }} />
          <button type="button" onClick={() => s.setSheet(false)} style={{ border: 0, background: "transparent", color: "var(--fg2)", fontSize: 13 }}>
            Close
          </button>
        </div>
        <div style={{ flex: "1 1 auto", overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ margin: "0 0 4px", fontSize: 13, color: "var(--fg2)" }}>
            Pick a goal to run once. The run produces one post per targeted platform and lands in Posts as a draft.
          </p>
          {s.goals.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => {
                s.setSheet(false);
                s.toast("Run queued for " + g.name);
              }}
              style={{ display: "flex", flexDirection: "column", gap: 4, textAlign: "left", padding: 12, border: "1px solid var(--border)", borderRadius: "var(--r3)", background: "var(--surface)" }}
            >
              <span style={{ fontSize: 14, color: "var(--fg)" }}>{g.name}</span>
              <span style={{ fontSize: 12, color: "var(--fg2)" }}>
                {g.platforms.join(" + ")} · {g.schedule.cadence} · {s.modelById(g.modelId)?.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- confirm */

function ConfirmDialog() {
  const s = useReds();
  const c = s.confirm;
  if (!c) return null;
  const hasAction = c.hasAction !== false && !!c.run;

  return (
    <div role="dialog" aria-label={c.title} style={{ ...SCRIM, zIndex: 90, alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ ...PANEL, width: "min(460px,94vw)", padding: 20 }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 600 }}>{c.title}</h2>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--fg2)", lineHeight: 1.5 }}>{c.body}</p>
        <ul style={{ listStyle: "none", margin: "0 0 16px", padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          {(c.items || []).map((i) => (
            <li key={i.label} style={{ fontSize: 12, color: "var(--fg2)", fontFamily: MONO }}>
              {i.label}
            </li>
          ))}
        </ul>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" onClick={() => s.ask(null)} style={{ padding: "7px 13px", border: "1px solid var(--border)", borderRadius: "var(--r3)", background: "var(--surface)", color: "var(--fg2)", fontSize: 13 }}>
            Cancel
          </button>
          {hasAction ? (
            <button
              type="button"
              onClick={c.run}
              style={{ padding: "7px 13px", border: c.border || "1px solid var(--red)", borderRadius: "var(--r3)", background: c.bg || "var(--surface)", color: c.fg || "var(--red)", fontSize: 13, fontWeight: 600 }}
            >
              {c.actionLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- asset picker */

function AssetPicker() {
  const s = useReds();
  const pk = s.picker;
  const d = s.goalDraft;
  if (!pk) return null;

  const items = s.assets.filter((a) => pk.kind === "any" || a.kind === pk.kind);

  return (
    <div role="dialog" aria-label="Choose assets" style={{ ...SCRIM, alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ ...PANEL, width: "min(760px,94vw)", maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{pk.multi ? "Choose assets" : "Choose a logo"}</h2>
          <span style={{ fontSize: 12, color: "var(--fg2)" }}>{items.length} available</span>
          <span style={{ flex: "1 1 auto" }} />
          <button type="button" onClick={() => s.setPicker(null)} style={{ border: 0, background: "transparent", color: "var(--fg2)", fontSize: 13 }}>
            Close
          </button>
        </div>
        <div style={{ flex: "1 1 auto", overflowY: "auto", padding: 16, display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))", gap: 12 }}>
          {items.map((a) => {
            const cur = d ? d[pk.field] : null;
            const on = pk.multi ? Array.isArray(cur) && cur.includes(a.id) : cur === a.id;
            return (
              <button
                key={a.id}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  if (!d) return;
                  if (pk.multi) {
                    const arr = Array.isArray(cur) ? cur : [];
                    s.setGoalDraft({ ...d, [pk.field]: on ? arr.filter((x) => x !== a.id) : [...arr, a.id] });
                  } else {
                    s.setGoalDraft({ ...d, [pk.field]: a.id });
                    s.setPicker(null);
                  }
                }}
                style={{ display: "flex", flexDirection: "column", gap: 6, padding: 6, border: `1px solid ${on ? "var(--green-line)" : "var(--border)"}`, borderRadius: "var(--r3)", background: on ? "var(--green-tint)" : "var(--surface)", textAlign: "left" }}
              >
                <span aria-hidden style={{ width: "100%", aspectRatio: "4 / 3", borderRadius: "var(--r2)", background: a.tint }} />
                <span style={{ fontSize: 11, color: "var(--fg2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 18px", borderTop: "1px solid var(--border)" }}>
          <button type="button" onClick={() => s.setPicker(null)} style={{ padding: "7px 13px", border: 0, borderRadius: "var(--r3)", background: "var(--green)", color: "var(--on-green)", fontSize: 13, fontWeight: 600 }}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- asset drawer */

function AssetDrawer() {
  const s = useReds();
  const a = s.drawerId ? s.assets.find((x) => x.id === s.drawerId) : null;
  if (!a) return null;

  const meta = [
    { k: "Asset ID", v: a.id, font: MONO },
    { k: "Kind", v: a.kind, font: "inherit" },
    { k: "Type", v: a.mimeType, font: MONO },
    { k: "Dimensions", v: a.width ? `${a.width}×${a.height}` : "—", font: MONO },
    { k: "Size", v: fmtBytes(a.sizeBytes), font: MONO },
    { k: "Uploaded by", v: a.uploadedBy, font: "inherit" },
    { k: "Uploaded", v: absDT(a.uploadedAt), font: MONO },
    { k: "Tags", v: a.tags.join(", "), font: "inherit" },
  ];

  return (
    <div role="dialog" aria-label="Asset detail" style={{ ...SCRIM, justifyContent: "flex-end" }}>
      <div style={{ width: "min(440px,94vw)", height: "100%", background: "var(--surface)", borderLeft: "1px solid var(--border)", boxShadow: "var(--shadow)", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</h2>
          <span style={{ flex: "1 1 auto" }} />
          <button type="button" onClick={() => s.setDrawerId(null)} style={{ border: 0, background: "transparent", color: "var(--fg2)", fontSize: 13 }}>
            Close
          </button>
        </div>

        <div style={{ flex: "1 1 auto", overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 18 }}>
          <span aria-hidden style={{ width: "100%", aspectRatio: "4 / 3", border: "1px solid var(--border-strong)", borderRadius: "var(--r3)", background: a.tint }} />
          <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 18px", fontSize: 13 }}>
            {meta.map((m) => (
              <div key={m.k} style={{ display: "contents" }}>
                <dt style={{ color: "var(--fg2)", fontSize: 12 }}>{m.k}</dt>
                <dd style={{ margin: 0, fontFamily: m.font }}>{m.v}</dd>
              </div>
            ))}
          </dl>
          <div>
            <h3 style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600 }}>Used in</h3>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              {a.usedInPostIds.map((id) => {
                const p = s.posts.find((x) => x.id === id);
                return (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => { s.setDrawerId(null); s.go(`/posts/${id}`); }}
                      style={{ border: 0, background: "transparent", padding: 0, fontSize: 12, color: "var(--green-text)", fontFamily: MONO }}
                    >
                      {id}
                    </button>{" "}
                    <span style={{ fontSize: 12, color: "var(--fg2)" }}>{p ? STATES[p.state].l : "removed"}</span>
                  </li>
                );
              })}
              {a.usedInPostIds.length === 0 ? (
                <li style={{ fontSize: 12, color: "var(--fg2)" }}>Not placed in any post yet.</li>
              ) : null}
            </ul>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, padding: "14px 20px", borderTop: "1px solid var(--border)" }}>
          <label style={{ padding: "7px 13px", border: "1px solid var(--border)", borderRadius: "var(--r3)", background: "var(--surface)", color: "var(--fg2)", fontSize: 13, cursor: "pointer" }}>
            Replace file
            <input
              type="file"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                s.setAssets((xs) => xs.map((x) => (x.id === a.id ? { ...x, sizeBytes: f.size, previewUrl: URL.createObjectURL(f) } : x)));
                s.toast("File replaced");
              }}
              style={{ display: "none" }}
            />
          </label>
          <button
            type="button"
            onClick={() => {
              const blocked = a.usedInPostIds
                .map((id) => s.posts.find((p) => p.id === id))
                .filter((p) => p && (p.state === "scheduled" || p.state === "published"));
              if (blocked.length) {
                s.ask({
                  title: "This asset is in use",
                  body: "It sits in a scheduled or published post. Swap it there first.",
                  items: blocked.map((p) => ({ label: p!.id + " — " + STATES[p!.state].l })),
                  hasAction: false,
                });
                return;
              }
              s.setAssets((xs) => xs.filter((x) => x.id !== a.id));
              s.setDrawerId(null);
              s.toast("Asset deleted");
            }}
            style={{ padding: "7px 13px", border: "1px solid var(--red-br)", borderRadius: "var(--r3)", background: "var(--surface)", color: "var(--red)", fontSize: 13 }}
          >
            Delete asset
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- upload modal */

export function useAssetIngest() {
  const s = useReds();

  return (files: FileList | File[] | null | undefined) => {
    const arr = Array.from(files || []);
    if (!arr.length) return;

    const queue = arr.map((f) => ({
      id: Math.random().toString(36).slice(2),
      name: f.name,
      size: f.size,
      pct: 0,
      state: (f.size > 26214400
        ? "failed"
        : s.assets.find((a) => a.name === f.name && a.sizeBytes === f.size)
          ? "duplicate"
          : "uploading") as "uploading" | "failed" | "duplicate",
      file: f,
    }));

    s.setUploads((u) => [...u, ...queue]);

    const landed: Asset[] = [];
    const tick = setInterval(() => {
      let done = true;
      s.setUploads((us) =>
        us.map((u) => {
          if (u.state !== "uploading") return u;
          const pct = Math.min(100, u.pct + 14 + Math.random() * 18);
          if (pct < 100) {
            done = false;
            return { ...u, pct };
          }
          landed.push({
            id: "AST-U" + Math.random().toString(36).slice(2, 7),
            name: u.name,
            kind: u.file.type.startsWith("video") ? "video" : u.file.type.startsWith("image") ? "image" : "document",
            mimeType: u.file.type || "application/octet-stream",
            sizeBytes: u.size,
            width: 1080,
            height: 1350,
            tags: ["upload"],
            usedInPostIds: [],
            uploadedBy: CURRENT_USER,
            uploadedAt: iso(Date.now()),
            tint: TINTS[Math.floor(Math.random() * TINTS.length)],
            previewUrl: URL.createObjectURL(u.file),
          });
          return { ...u, pct: 100, state: "done" as const };
        }),
      );
      if (done) {
        clearInterval(tick);
        if (landed.length) s.setAssets((xs) => [...xs, ...landed]);
      }
    }, 260);
  };
}

function UploadModal() {
  const s = useReds();
  const ingest = useAssetIngest();
  const [hot, setHot] = useState(false);
  if (!s.uploadModal) return null;

  const doneCount = s.uploads.filter((u) => u.state === "done").length;

  return (
    <div role="dialog" aria-label="Upload assets" style={{ ...SCRIM, alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ ...PANEL, width: "min(620px,94vw)", maxHeight: "82vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Upload assets</h2>
          <span style={{ flex: "1 1 auto" }} />
          <button type="button" onClick={() => { s.setUploadModal(false); setHot(false); }} style={{ border: 0, background: "transparent", color: "var(--fg2)", fontSize: 13 }}>
            Close
          </button>
        </div>

        <div style={{ flex: "1 1 auto", overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          <label
            onDragOver={(e) => { e.preventDefault(); if (!hot) setHot(true); }}
            onDragLeave={() => setHot(false)}
            onDrop={(e) => { e.preventDefault(); setHot(false); ingest(e.dataTransfer?.files); }}
            onPaste={(e) => ingest(e.clipboardData?.files)}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "34px 20px", border: `1px dashed ${hot ? "var(--green-line)" : "var(--border-strong)"}`, borderRadius: "var(--r4)", background: hot ? "var(--green-tint)" : "var(--surface)", cursor: "pointer", textAlign: "center" }}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="var(--fg3)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 16V4M7 9l5-5 5 5M4 16v3h16v-3" />
            </svg>
            <span style={{ fontSize: 14, color: "var(--fg)" }}>Drop files here, paste, or click to browse</span>
            <span style={{ fontSize: 12, color: "var(--fg3)" }}>Select as many files as you need — each one uploads on its own row.</span>
            <input type="file" multiple onChange={(e) => ingest(e.target.files)} style={{ display: "none" }} />
          </label>

          {s.uploads.length ? (
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
                <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>
                  {s.uploads.length} {s.uploads.length === 1 ? "file" : "files"}
                </h3>
                <span style={{ flex: "1 1 auto" }} />
                <button type="button" onClick={() => s.setUploads((u) => u.filter((x) => x.state === "uploading"))} style={{ border: 0, background: "transparent", padding: 0, fontSize: 12, color: "var(--green-text)" }}>
                  Clear finished
                </button>
              </div>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                {s.uploads.map((u) => {
                  const fill = u.state === "failed" ? "var(--red)" : u.state === "duplicate" ? "var(--amber)" : "var(--green)";
                  const fg = u.state === "failed" ? "var(--red)" : u.state === "duplicate" ? "var(--amber)" : "var(--fg2)";
                  const status =
                    u.state === "failed" ? "Over 25 MB"
                      : u.state === "duplicate" ? "Already in the library"
                        : u.state === "done" ? "Uploaded"
                          : Math.round(u.pct) + "%";
                  const actionLabel =
                    u.state === "failed" ? "Retry" : u.state === "duplicate" ? "Keep both" : u.state === "done" ? "Dismiss" : "Cancel";
                  return (
                    <li key={u.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "var(--r3)", background: "var(--surface2)" }}>
                      <span style={{ flex: "1 1 160px", minWidth: 0, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</span>
                      <span style={{ flex: "0 0 120px", height: 4, borderRadius: 2, background: "var(--sunken)", overflow: "hidden" }}>
                        <span style={{ display: "block", height: "100%", width: Math.round(u.pct) + "%", background: fill }} />
                      </span>
                      <span style={{ flex: "0 0 auto", fontSize: 12, color: fg }}>{status}</span>
                      <button
                        type="button"
                        onClick={() => {
                          if (u.state === "duplicate" || u.state === "failed") {
                            s.setUploads((xs) => xs.filter((v) => v.id !== u.id));
                            ingest([u.file]);
                          } else {
                            s.setUploads((xs) => xs.filter((v) => v.id !== u.id));
                          }
                        }}
                        style={{ flex: "0 0 auto", border: "1px solid var(--border)", borderRadius: "var(--r2)", background: "var(--surface)", color: "var(--fg2)", fontSize: 11, padding: "3px 9px" }}
                      >
                        {actionLabel}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderTop: "1px solid var(--border)" }}>
          <span style={{ fontSize: 12, color: "var(--fg2)" }}>
            {s.uploads.length ? `${doneCount} of ${s.uploads.length} uploaded` : `${s.assets.length} assets in the library`}
          </span>
          <span style={{ flex: "1 1 auto" }} />
          <button type="button" onClick={() => s.setUploadModal(false)} style={{ padding: "7px 13px", border: 0, borderRadius: "var(--r3)", background: "var(--green)", color: "var(--on-green)", fontSize: 13, fontWeight: 600 }}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- add model modal */

function NewModelModal() {
  const s = useReds();
  const d = s.newModel;
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [reveal, setReveal] = useState(false);
  if (!d) return null;

  const put = (patch: Partial<typeof d>) => s.setNewModel({ ...d, ...patch });
  const touch = (k: string) => setTouched((t) => ({ ...t, [k]: true }));

  const labelBad = !d.label.trim();
  const providerBad = !d.provider.trim();
  const keyBad = d.key.trim().length < 12;
  const bad = labelBad || providerBad || keyBad;
  const est = (4200 / 1e6) * Number(d.inPrice) + (1800 / 1e6) * Number(d.outPrice);

  const hint = labelBad
    ? "Add a model label to save."
    : providerBad
      ? "Name the provider to save."
      : keyBad
        ? "Paste a valid API key to save."
        : "Saved to this session only.";

  const textFields = [
    { k: "label" as const, label: "Model label", placeholder: "Claude Sonnet 4.6", bad: labelBad, msg: "The label names this model everywhere in the product." },
    { k: "provider" as const, label: "Provider", placeholder: "Anthropic", bad: providerBad, msg: "Name the provider so pricing is attributable." },
  ];

  const numbers = [
    { label: "Max tokens", value: d.maxTokens, step: 50, set: (v: number) => put({ maxTokens: v }) },
    { label: "Input ₹ / M tok", value: d.inPrice, step: 10, set: (v: number) => put({ inPrice: v }) },
    { label: "Output ₹ / M tok", value: d.outPrice, step: 10, set: (v: number) => put({ outPrice: v }) },
  ];

  const roles: { k: ModelRole; label: string }[] = [
    { k: "caption", label: "Caption" },
    { k: "slides", label: "Slides" },
    { k: "both", label: "Both" },
  ];

  const close = () => { s.setNewModel(null); setTouched({}); setReveal(false); };

  return (
    <div role="dialog" aria-label="Add model" style={{ ...SCRIM, alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ ...PANEL, width: "min(560px,94vw)", maxHeight: "86vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Add model</h2>
          <span style={{ flex: "1 1 auto" }} />
          <button type="button" onClick={close} style={{ border: 0, background: "transparent", color: "var(--fg2)", fontSize: 13 }}>Close</button>
        </div>

        <div style={{ flex: "1 1 auto", overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 18 }}>
          {textFields.map((f) => (
            <label key={f.k} style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "var(--fg2)" }}>
              {f.label}
              <input
                value={d[f.k]}
                onChange={(e) => put({ [f.k]: e.target.value } as Partial<typeof d>)}
                onBlur={() => touch(f.k)}
                placeholder={f.placeholder}
                aria-invalid={f.bad}
                style={{ padding: "9px 11px", border: `1px solid ${f.bad && touched[f.k] ? "var(--red)" : "var(--border)"}`, borderRadius: "var(--r3)", background: "var(--surface2)", color: "var(--fg)", fontSize: 13 }}
              />
              {f.bad && touched[f.k] ? <span style={{ fontSize: 12, color: "var(--red)" }}>{f.msg}</span> : null}
            </label>
          ))}

          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "var(--fg2)" }}>
            API key
            <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type={reveal ? "text" : "password"}
                value={d.key}
                onChange={(e) => put({ key: e.target.value })}
                onBlur={() => touch("key")}
                placeholder="sk-ant-…"
                aria-invalid={keyBad}
                style={{ flex: "1 1 auto", minWidth: 0, padding: "9px 11px", border: `1px solid ${keyBad && touched.key ? "var(--red)" : "var(--border)"}`, borderRadius: "var(--r3)", background: "var(--surface2)", color: "var(--fg)", fontFamily: MONO, fontSize: 12 }}
              />
              <button type="button" onClick={() => setReveal(!reveal)} style={{ flex: "0 0 auto", padding: "8px 11px", border: "1px solid var(--border)", borderRadius: "var(--r3)", background: "var(--surface)", color: "var(--fg2)", fontSize: 12 }}>
                {reveal ? "Hide" : "Show"}
              </button>
            </span>
            <span style={{ fontSize: 12, color: "var(--fg3)" }}>
              Held in memory for this session only — it is never written to storage or sent anywhere but the provider.
            </span>
            {keyBad && touched.key ? (
              <span style={{ fontSize: 12, color: "var(--red)" }}>That key looks too short — paste the full provider key.</span>
            ) : null}
          </label>

          <div>
            <span style={{ display: "block", fontSize: 12, color: "var(--fg2)", marginBottom: 6 }}>Role</span>
            <div role="group" aria-label="Model role" style={{ display: "flex", gap: 2, padding: 2, border: "1px solid var(--border)", borderRadius: "var(--r3)", background: "var(--surface2)" }}>
              {roles.map((r) => {
                const on = d.role === r.k;
                const c = seg(on);
                return (
                  <button key={r.k} type="button" onClick={() => put({ role: r.k })} aria-pressed={on} style={{ flex: "1 1 0", border: 0, borderRadius: "var(--r2)", padding: "6px 8px", fontSize: 12, background: c.bg, color: c.fg }}>
                    {r.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
            {numbers.map((f) => (
              <label key={f.label} style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "var(--fg2)" }}>
                {f.label}
                <input
                  type="number"
                  value={f.value}
                  step={f.step}
                  onChange={(e) => f.set(Number(e.target.value))}
                  style={{ width: 132, padding: "8px 10px", border: "1px solid var(--border)", borderRadius: "var(--r3)", background: "var(--surface2)", color: "var(--fg)", fontFamily: MONO, fontSize: 12 }}
                />
              </label>
            ))}
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "var(--fg2)" }}>
            Temperature
            <input type="range" min={0} max={1} step={0.05} value={d.temperature} onChange={(e) => put({ temperature: Number(e.target.value) })} style={{ flex: "1 1 auto", accentColor: "var(--green-line)" }} />
            <span style={{ fontFamily: MONO }}>{Number(d.temperature).toFixed(2)}</span>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--fg2)" }}>
            <input type="checkbox" checked={d.enabled} onChange={() => put({ enabled: !d.enabled })} style={{ accentColor: "var(--green-line)" }} />
            Enable this model for new runs
          </label>

          <div style={{ padding: "12px 14px", border: "1px solid var(--green-tint2)", borderRadius: "var(--r3)", background: "var(--green-tint)" }}>
            <span style={{ fontFamily: MONO, fontSize: 16, color: "var(--green-text)" }}>est. {inr(est)}</span>
            <span style={{ display: "block", fontSize: 12, color: "var(--fg2)", marginTop: 2 }}>
              est. per post at 4,200 in and 1,800 out — the workspace average
            </span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderTop: "1px solid var(--border)" }}>
          <span style={{ fontSize: 12, color: "var(--fg2)" }}>{hint}</span>
          <span style={{ flex: "1 1 auto" }} />
          <button type="button" onClick={close} style={{ padding: "7px 13px", border: "1px solid var(--border)", borderRadius: "var(--r3)", background: "var(--surface)", color: "var(--fg2)", fontSize: 13 }}>
            Cancel
          </button>
          <button
            type="button"
            aria-disabled={bad}
            title={hint}
            onClick={async () => {
              if (bad) { touch("label"); touch("provider"); touch("key"); return; }
              try {
                const res = await fetch("/api/models", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    label: d.label.trim(),
                    provider: d.provider.trim(),
                    role: d.role.toUpperCase(),
                    inputPricePerMTokInr: Number(d.inPrice),
                    outputPricePerMTokInr: Number(d.outPrice),
                    maxTokens: Number(d.maxTokens),
                    temperature: Number(d.temperature),
                    enabled: d.enabled,
                    key: d.key.trim(),
                  }),
                });

                if (!res.ok) {
                  const errData = await res.json().catch(() => ({}));
                  throw new Error(errData.message || "Failed to add model.");
                }

                const savedModel = await res.json();
                const formattedModel: Model = {
                  id: savedModel.id,
                  label: savedModel.label,
                  provider: savedModel.provider,
                  role: (savedModel.role || "BOTH").toLowerCase() as ModelRole,
                  inputPricePerMTokInr: savedModel.inputPricePerMTokInr,
                  outputPricePerMTokInr: savedModel.outputPricePerMTokInr,
                  maxTokens: savedModel.maxTokens,
                  temperature: savedModel.temperature,
                  enabled: savedModel.enabled,
                  keyLast4: savedModel.keyLast4 || undefined,
                };

                s.setModels((ms) => [...ms, formattedModel]);
                s.toast(d.label.trim() + " added to database");
                close();
              } catch (err: any) {
                s.toast(err.message || "Failed to add model");
              }
            }}
            style={{ padding: "7px 13px", border: 0, borderRadius: "var(--r3)", background: "var(--green)", color: "var(--on-green)", fontSize: 13, fontWeight: 600, opacity: bad ? 0.5 : 1 }}
          >
            Add model
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- toasts */

function Toasts() {
  const s = useReds();
  return (
    <div aria-live="polite" style={{ position: "fixed", right: 24, bottom: 24, zIndex: 90, display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
      {s.toasts.map((t) => (
        <div
          key={t.id}
          style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 14px", background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `3px solid ${t.undo ? "var(--green)" : "var(--border-strong)"}`, borderRadius: "var(--r3)", boxShadow: "var(--shadow)", animation: "reds-toast 160ms ease-out", fontSize: 13 }}
        >
          <span style={{ color: "var(--fg)" }}>{t.text}</span>
          {t.undo ? (
            <button type="button" onClick={t.undo} style={{ border: 0, background: "transparent", padding: 0, fontSize: 12, color: "var(--green-text)", fontWeight: 600 }}>
              Undo
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export { PILL };
