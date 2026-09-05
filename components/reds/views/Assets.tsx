"use client";

import { useState } from "react";
import { STATES } from "@/lib/reds/data";
import { MONO, fmtBytes, relDT } from "@/lib/reds/format";
import { EmptyState } from "../charts";
import { chip, seg, useReds } from "../store";
import { useAssetIngest } from "../overlays";
import type { AssetKind } from "@/lib/reds/types";

const KINDS: AssetKind[] = ["image", "logo", "video", "document"];

const HEADERS: { k: string; label: string; align: "left" | "right" }[] = [
  { k: "preview", label: "Preview", align: "left" },
  { k: "name", label: "Name", align: "left" },
  { k: "kind", label: "Kind", align: "left" },
  { k: "dims", label: "Dimensions", align: "right" },
  { k: "size", label: "Size", align: "right" },
  { k: "tags", label: "Tags", align: "left" },
  { k: "used", label: "Used in", align: "right" },
  { k: "uploaded", label: "Uploaded", align: "left" },
];

export function Assets() {
  const s = useReds();
  if (s.now == null) return null;
  return <AssetsInner now={s.now} />;
}

function AssetsInner({ now }: { now: number }) {
  const s = useReds();
  const ingest = useAssetIngest();

  const [view, setView] = useState<"grid" | "table">("grid");
  const [kinds, setKinds] = useState<AssetKind[]>([]);
  const [assetSel, setAssetSel] = useState<Record<string, boolean>>({});
  const [sort, setSort] = useState<{ col: string; dir: "asc" | "desc" }>({ col: "uploaded", dir: "desc" });

  const list = s.assets.filter((a) => !kinds.length || kinds.includes(a.kind));

  const rows = list
    .map((a) => ({
      ...a,
      used: a.usedInPostIds.length,
      uploaded: new Date(a.uploadedAt).getTime(),
      dims: a.width || 0,
      size: a.sizeBytes,
    }))
    .sort((a, b) => {
      const x = a[sort.col as keyof typeof a];
      const y = b[sort.col as keyof typeof b];
      if (typeof x === "string" && typeof y === "string") {
        return sort.dir === "asc" ? x.localeCompare(y) : y.localeCompare(x);
      }
      return sort.dir === "asc" ? Number(x) - Number(y) : Number(y) - Number(x);
    });

  const selIds = Object.keys(assetSel).filter((k) => assetSel[k]);
  const toggle = (id: string) => setAssetSel((x) => ({ ...x, [id]: !x[id] }));

  /** Posts that would break if the given assets were deleted. */
  const blockers = (ids: string[]) =>
    ids
      .map((id) => s.assets.find((a) => a.id === id))
      .filter(Boolean)
      .flatMap((a) =>
        a!.usedInPostIds
          .map((pid) => s.posts.find((p) => p.id === pid))
          .filter((p) => p && (p.state === "scheduled" || p.state === "published")),
      );

  const bulk = [
    {
      label: "Tag",
      br: "var(--border)",
      fg: "var(--fg2)",
      run: () => {
        s.setAssets((xs) =>
          xs.map((a) => (assetSel[a.id] && !a.tags.includes("reviewed") ? { ...a, tags: [...a.tags, "reviewed"] } : a)),
        );
        s.toast(selIds.length + " assets tagged “reviewed”");
      },
    },
    { label: "Download", br: "var(--border)", fg: "var(--fg2)", run: () => s.toast(selIds.length + " assets queued for download") },
    {
      label: "Delete",
      br: "var(--red-br)",
      fg: "var(--red)",
      run: () => {
        const b = blockers(selIds);
        if (b.length) {
          s.ask({
            title: "These assets are in use",
            body: "Delete is blocked while an asset sits in a scheduled or published post. Swap the asset on these posts first.",
            items: b.slice(0, 6).map((p) => ({ label: p!.id + " — " + STATES[p!.state].l })),
            hasAction: false,
          });
          return;
        }
        s.setAssets((xs) => xs.filter((a) => !assetSel[a.id]));
        setAssetSel({});
        s.toast(selIds.length + " assets deleted");
      },
    },
  ];

  const sortHeader = (k: string) =>
    setSort((cur) => ({ col: k, dir: cur.col === k && cur.dir === "desc" ? "asc" : "desc" }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14 }}>
        <button
          type="button"
          onClick={() => s.setUploadModal(true)}
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", border: 0, borderRadius: "var(--r3)", background: "var(--green)", color: "var(--on-green)", fontSize: 13, fontWeight: 600 }}
        >
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 17V5M7 10l5-5 5 5M5 19h14" />
          </svg>
          Upload files
        </button>
        <span style={{ fontSize: 12, color: "var(--fg3)" }}>
          Images, video and documents up to 25 MB. Uploads live in memory for this session only.
        </span>
      </div>

      {s.uploads.length ? (
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
              <li key={u.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "var(--r3)", background: "var(--surface)" }}>
                <span style={{ flex: "0 0 220px", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</span>
                <span style={{ flex: "1 1 auto", height: 4, borderRadius: 2, background: "var(--sunken)", overflow: "hidden" }}>
                  <span style={{ display: "block", height: "100%", width: Math.round(u.pct) + "%", background: fill }} />
                </span>
                <span style={{ flex: "0 0 auto", fontSize: 12, color: fg }}>{status}</span>
                <button
                  type="button"
                  onClick={() => {
                    s.setUploads((xs) => xs.filter((v) => v.id !== u.id));
                    if (u.state === "duplicate" || u.state === "failed") ingest([u.file]);
                  }}
                  style={{ border: "1px solid var(--border)", borderRadius: "var(--r2)", background: "var(--surface)", color: "var(--fg2)", fontSize: 11, padding: "3px 9px" }}
                >
                  {actionLabel}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {/* ---- controls ---- */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <div role="group" aria-label="Asset view" style={{ display: "flex", gap: 2, padding: 2, border: "1px solid var(--border)", borderRadius: "var(--r3)", background: "var(--surface2)" }}>
          {(["grid", "table"] as const).map((v) => {
            const on = view === v;
            const c = seg(on);
            return (
              <button key={v} type="button" aria-pressed={on} onClick={() => setView(v)} style={{ border: 0, borderRadius: "var(--r2)", padding: "4px 10px", fontSize: 12, background: c.bg, color: c.fg }}>
                {v === "grid" ? "Grid" : "Table"}
              </button>
            );
          })}
        </div>

        {KINDS.map((k) => {
          const on = kinds.includes(k);
          const c = chip(on);
          return (
            <button
              key={k}
              type="button"
              aria-pressed={on}
              onClick={() => setKinds((x) => (on ? x.filter((y) => y !== k) : [...x, k]))}
              style={{ padding: "4px 10px", border: `1px solid ${c.br}`, borderRadius: 999, background: c.bg, color: c.fg, fontSize: 12 }}
            >
              {k[0].toUpperCase() + k.slice(1)}s
            </button>
          );
        })}

        <span style={{ flex: "1 1 auto" }} />
        <span style={{ fontSize: 12, color: "var(--fg2)" }}>{rows.length} of {s.assets.length} assets</span>
      </div>

      {selIds.length ? (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, padding: "8px 12px", border: "1px solid var(--green-line)", borderRadius: "var(--r3)", background: "var(--green-tint)" }}>
          <strong style={{ fontSize: 13, color: "var(--green-text)" }}>{selIds.length} selected</strong>
          <span style={{ flex: "1 1 auto" }} />
          {bulk.map((a) => (
            <button key={a.label} type="button" onClick={a.run} style={{ padding: "5px 11px", border: `1px solid ${a.br}`, borderRadius: "var(--r3)", background: "var(--surface)", color: a.fg, fontSize: 12 }}>
              {a.label}
            </button>
          ))}
          <button type="button" onClick={() => setAssetSel({})} style={{ border: 0, background: "transparent", color: "var(--fg2)", fontSize: 12, padding: 4 }}>Clear</button>
        </div>
      ) : null}

      {s.assets.length === 0 ? (
        <EmptyState
          title="The library is empty"
          body="Upload images, video or documents here. Goals draw their slide images and references from this library."
          actionLabel="Upload files"
          onAction={() => s.setUploadModal(true)}
        />
      ) : null}

      {/* ---- grid ---- */}
      {s.assets.length > 0 && view === "grid" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 14 }}>
          {rows.map((a) => (
            <div key={a.id} style={{ border: `1px solid ${assetSel[a.id] ? "var(--green-line)" : "var(--border)"}`, borderRadius: "var(--r4)", background: "var(--surface)", overflow: "hidden" }}>
              <button type="button" onClick={() => s.setDrawerId(a.id)} aria-label={"Open " + a.name} style={{ display: "block", width: "100%", border: 0, padding: 0, background: a.tint, aspectRatio: "4 / 3" }} />
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: 10 }}>
                <input type="checkbox" aria-label={"Select " + a.name} checked={!!assetSel[a.id]} onChange={() => toggle(a.id)} style={{ accentColor: "var(--green-line)", marginTop: 3 }} />
                <span style={{ flex: "1 1 auto", minWidth: 0 }}>
                  <button type="button" onClick={() => s.setDrawerId(a.id)} style={{ display: "block", width: "100%", border: 0, background: "transparent", padding: 0, textAlign: "left", fontSize: 13, color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {a.name}
                  </button>
                  <span style={{ display: "block", fontSize: 12, color: "var(--fg2)", fontFamily: MONO }}>
                    {(a.width ? `${a.width}×${a.height}` : a.kind) + " · " + fmtBytes(a.sizeBytes)}
                  </span>
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* ---- table ---- */}
      {s.assets.length > 0 && view === "table" ? (
        <div style={{ overflowX: "auto", borderTop: "1px solid var(--border-strong)" }}>
          <table style={{ width: "100%", minWidth: 960, fontSize: 13 }}>
            <thead>
              <tr>
                <th scope="col" style={{ width: 34, padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Select</span>
                </th>
                {HEADERS.map((h) => {
                  const on = sort.col === h.k;
                  return (
                    <th
                      key={h.k}
                      scope="col"
                      aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                      style={{ padding: 0, borderBottom: "1px solid var(--border)", textAlign: h.align, whiteSpace: "nowrap" }}
                    >
                      <button
                        type="button"
                        onClick={() => sortHeader(h.k)}
                        style={{ display: "flex", alignItems: "center", gap: 5, width: "100%", justifyContent: h.align === "right" ? "flex-end" : "flex-start", border: 0, background: "transparent", padding: "8px 10px", fontSize: 12, fontWeight: 500, color: on ? "var(--green-text)" : "var(--fg2)" }}
                      >
                        {h.label}
                        <span aria-hidden style={{ fontSize: 10, color: "var(--green-text)" }}>{on ? (sort.dir === "asc" ? "▲" : "▼") : ""}</span>
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} style={{ background: assetSel[a.id] ? "var(--green-tint)" : "transparent", borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "6px 10px" }}>
                    <input type="checkbox" aria-label={"Select " + a.name} checked={!!assetSel[a.id]} onChange={() => toggle(a.id)} style={{ accentColor: "var(--green-line)" }} />
                  </td>
                  <td style={{ padding: "6px 10px" }}>
                    <button type="button" onClick={() => s.setDrawerId(a.id)} aria-label={"Open " + a.name} style={{ width: 34, height: 26, border: "1px solid var(--border-strong)", borderRadius: "var(--r2)", background: a.tint, padding: 0 }} />
                  </td>
                  <td style={{ padding: "6px 10px" }}>
                    <input
                      value={a.name}
                      onChange={(e) => s.setAssets((xs) => xs.map((x) => (x.id === a.id ? { ...x, name: e.target.value } : x)))}
                      aria-label={"Rename " + a.name}
                      style={{ width: "100%", minWidth: 150, border: "1px solid transparent", borderRadius: "var(--r2)", background: "transparent", padding: "3px 5px", fontSize: 13 }}
                    />
                  </td>
                  <td style={{ padding: "6px 10px", color: "var(--fg2)" }}>{a.kind}</td>
                  <td style={{ padding: "6px 10px", textAlign: "right", fontFamily: MONO, fontSize: 12, color: "var(--fg2)" }}>
                    {a.width ? `${a.width}×${a.height}` : "—"}
                  </td>
                  <td style={{ padding: "6px 10px", textAlign: "right", fontFamily: MONO, fontSize: 12, color: "var(--fg2)" }}>{fmtBytes(a.sizeBytes)}</td>
                  <td style={{ padding: "6px 10px" }}>
                    <span style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {a.tags.map((t) => (
                        <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "1px 7px", border: "1px solid var(--border)", borderRadius: 999, fontSize: 11, color: "var(--fg2)" }}>
                          {t}
                          <button
                            type="button"
                            aria-label={"Remove tag " + t}
                            onClick={() => s.setAssets((xs) => xs.map((x) => (x.id === a.id ? { ...x, tags: x.tags.filter((y) => y !== t) } : x)))}
                            style={{ border: 0, background: "transparent", padding: 0, color: "var(--fg3)", fontSize: 11 }}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </span>
                  </td>
                  <td style={{ padding: "6px 10px", textAlign: "right" }}>
                    <button
                      type="button"
                      onClick={() => { s.setFilterStates([]); s.setFilterGoal("all"); s.go("/posts"); }}
                      style={{ border: 0, background: "transparent", padding: 0, fontSize: 12, color: "var(--green-text)", fontFamily: MONO }}
                    >
                      {a.usedInPostIds.length}
                    </button>
                  </td>
                  <td style={{ padding: "6px 10px", color: "var(--fg2)", fontSize: 12, whiteSpace: "nowrap" }}>{relDT(a.uploadedAt, now)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
