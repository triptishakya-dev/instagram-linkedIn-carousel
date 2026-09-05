"use client";

import { MONO } from "@/lib/reds/format";

export interface VBar {
  h: string;
  fill: string;
  title: string;
  label?: string;
  labelFg?: string;
}

export interface HRow {
  label: string;
  w: string;
  fill: string;
  value: string;
}

export interface Group {
  hA: string;
  hB: string;
  title: string;
}

export interface ChartSpec {
  title: string;
  note: string;
  total: string;
  alt: string;
  kind: "vertical" | "horizontal" | "grouped";
  bars?: VBar[];
  rows?: HRow[];
  groups?: Group[];
  legend?: { label: string; fill: string }[];
  axisStart?: string;
  axisEnd?: string;
}

export function Chart({ c }: { c: ChartSpec }) {
  return (
    <div style={{ background: "var(--surface)", padding: "16px 18px 18px", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 2 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{c.title}</h3>
        <span style={{ flex: "1 1 auto" }} />
        <span style={{ fontSize: 12, color: "var(--fg2)", fontFamily: MONO }}>{c.total}</span>
      </div>
      <p style={{ margin: "0 0 16px", fontSize: 12, color: "var(--fg3)" }}>{c.note}</p>

      {c.kind === "vertical" ? (
        <>
          <div
            role="img"
            aria-label={c.alt}
            style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 132, paddingTop: 20, borderBottom: "1px solid var(--border)" }}
          >
            {(c.bars || []).map((b, i) => (
              <span key={i} title={b.title} style={{ position: "relative", flex: "1 1 0", height: "100%", display: "flex", alignItems: "flex-end" }}>
                <span style={{ width: "100%", height: b.h, minHeight: 2, borderRadius: "1px 1px 0 0", background: b.fill }} />
                {b.label ? (
                  <span
                    style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", bottom: `calc(${b.h} + 5px)`, whiteSpace: "nowrap", fontSize: 11, color: b.labelFg || "var(--fg3)", fontFamily: MONO }}
                  >
                    {b.label}
                  </span>
                ) : null}
              </span>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 7, fontSize: 11, color: "var(--fg3)" }}>
            <span>{c.axisStart}</span>
            <span>{c.axisEnd}</span>
          </div>
        </>
      ) : null}

      {c.kind === "grouped" ? (
        <>
          <div
            role="img"
            aria-label={c.alt}
            style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 132, paddingTop: 20, borderBottom: "1px solid var(--border)" }}
          >
            {(c.groups || []).map((g, i) => (
              <span key={i} title={g.title} style={{ flex: "1 1 0", height: "100%", display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 3 }}>
                <span style={{ width: 8, height: g.hA, minHeight: 2, borderRadius: "1px 1px 0 0", background: "var(--green)" }} />
                <span style={{ width: 8, height: g.hB, minHeight: 2, borderRadius: "1px 1px 0 0", background: "var(--n300)" }} />
              </span>
            ))}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 10 }}>
            {(c.legend || []).map((l) => (
              <span key={l.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--fg2)" }}>
                <span aria-hidden style={{ width: 8, height: 8, borderRadius: 1, background: l.fill }} />
                {l.label}
              </span>
            ))}
            <span style={{ flex: "1 1 auto" }} />
            <span style={{ fontSize: 11, color: "var(--fg3)" }}>{c.axisEnd}</span>
          </div>
        </>
      ) : null}

      {c.kind === "horizontal" ? (
        <ul role="img" aria-label={c.alt} style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 9 }}>
          {(c.rows || []).map((r) => (
            <li key={r.label} style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <span style={{ flex: "0 0 108px", fontSize: 12, color: "var(--fg2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.label}
              </span>
              <span style={{ flex: "1 1 auto", minWidth: 0, height: 10, background: "var(--sunken)", borderRadius: 2, overflow: "hidden" }}>
                <span style={{ display: "block", height: "100%", width: r.w, background: r.fill, borderRadius: 2 }} />
              </span>
              <span style={{ flex: "0 0 auto", fontSize: 12, color: "var(--fg2)", fontFamily: MONO }}>{r.value}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Section header used across every view. */
export function SectionHead({
  id,
  title,
  right,
}: {
  id?: string;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, paddingBottom: 10, borderBottom: "1px solid var(--border-strong)" }}>
      <h2 id={id} style={{ margin: 0, fontSize: 20, fontWeight: 600, lineHeight: 1.35 }}>
        {title}
      </h2>
      {right}
    </div>
  );
}

export function Figures({ figures }: { figures: { value: string; label: string }[] }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", marginTop: 20 }}>
      {figures.map((f) => (
        <div key={f.label} style={{ paddingRight: 40, marginRight: 40, borderRight: "1px solid var(--border)" }}>
          <div style={{ fontSize: 32, lineHeight: 1.15, fontWeight: 500, letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums" }}>
            {f.value}
          </div>
          <div style={{ fontSize: 12, color: "var(--fg2)", marginTop: 4 }}>{f.label}</div>
        </div>
      ))}
    </div>
  );
}

export function Pill({ bg, fg, br, children }: { bg: string; fg: string; br: string; children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: bg, color: fg, border: `1px solid ${br}`, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

/** Shared empty state — one line of what is missing, one of how to fill it. */
export function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div style={{ padding: "40px 2px", maxWidth: 560 }}>
      <p style={{ margin: "0 0 6px", fontSize: 16, color: "var(--fg)" }}>{title}</p>
      <p style={{ margin: "0 0 16px", color: "var(--fg2)", lineHeight: 1.5 }}>{body}</p>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          style={{ padding: "7px 13px", border: 0, borderRadius: "var(--r3)", background: "var(--green)", color: "var(--on-green)", fontSize: 13, fontWeight: 600 }}
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
