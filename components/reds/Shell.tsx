"use client";

import { usePathname } from "next/navigation";
import { useMemo, type ReactNode } from "react";
import { NAV } from "@/lib/reds/data";
import { inr, num } from "@/lib/reds/format";
import { useReds } from "./store";
import { Overlays } from "./overlays";

/** Maps a pathname onto the brief's route keys. */
export function routeOf(pathname: string) {
  if (pathname === "/") return "overview";
  const [, head, tail] = pathname.split("/");
  if (head === "goals") return tail ? "goal" : "goals";
  if (head === "posts") return tail ? "detail" : "posts";
  return head || "overview";
}

const TITLES: Record<string, string> = {
  overview: "Overview",
  goals: "Goals",
  goal: "Goal editor",
  posts: "Posts",
  assets: "Assets",
  calendar: "Calendar",
  accounts: "Accounts",
  usage: "Usage",
  settings: "Settings",
};

export function Shell({ children }: { children: ReactNode }) {
  const s = useReds();
  const pathname = usePathname();
  const route = routeOf(pathname);
  const expanded = !s.collapsed;

  const detailId = route === "detail" ? pathname.split("/")[2] : null;
  const pageTitle =
    route === "detail" ? decodeURIComponent(detailId || "Post") : TITLES[route] || "Overview";

  const crumb = route === "detail" ? "Posts" : route === "goal" ? "Goals" : "";
  const crumbHref = route === "detail" ? "/posts" : "/goals";

  const budget = useMemo(() => {
    const used = s.posts.reduce((a, p) => a + p.usage.inputTokens + p.usage.outputTokens, 0);
    const pct = Math.min(100, Math.round((used / s.budgetCap) * 100));
    return {
      pct,
      pctLabel: pct + "%",
      width: pct + "%",
      fill: pct >= 100 ? "var(--red)" : pct >= 80 ? "var(--amber)" : "var(--green)",
      fg: pct >= 100 ? "var(--red)" : pct >= 80 ? "var(--amber)" : "var(--fg2)",
      label:
        num(used) +
        " of " +
        num(s.budgetCap) +
        " — est. " +
        inr(s.posts.reduce((a, p) => a + p.usage.estimatedCostInr, 0)),
    };
  }, [s.posts, s.budgetCap]);

  const nav = NAV.map((n) => {
    const on =
      route === n.k ||
      (route === "detail" && n.k === "posts") ||
      (route === "goal" && n.k === "goals");
    return {
      ...n,
      on,
      bg: on ? "var(--green-tint)" : "transparent",
      fg: on ? "var(--green-text)" : "var(--fg2)",
      rule: on ? "var(--green)" : "transparent",
      weight: on ? 600 : 400,
    };
  });

  const narrow = s.vw < 1100;
  const conns = [
    { short: "IG", dot: "var(--green)", title: "Instagram — connected as @reds.studio, synced 20 minutes ago" },
    { short: "LI", dot: "var(--amber)", title: "LinkedIn — token expires in 5 days" },
  ];
  const themes: { k: "light" | "dark" | "system"; label: string; glyph: string }[] = [
    { k: "light", label: "Light", glyph: "Light" },
    { k: "dark", label: "Dark", glyph: "Dark" },
    { k: "system", label: "Match system", glyph: "Auto" },
  ];

  return (
    <div style={{ display: "flex", alignItems: "stretch", height: "100vh", overflow: "hidden", background: "var(--bg)" }}>
      <nav
        aria-label="Sections"
        style={{
          flex: "0 0 auto",
          width: expanded ? 248 : 64,
          height: "100%",
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          background: "var(--chrome)",
          borderRight: "1px solid var(--border)",
          transition: "width 160ms ease-out",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, height: 56, padding: "0 16px", borderBottom: "1px solid var(--border)" }}>
          <div aria-hidden style={{ width: 20, height: 20, flex: "0 0 auto", borderRadius: "var(--r1)", background: "var(--green)" }} />
          {expanded ? (
            <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: ".24em", color: "var(--fg)" }}>REDS</span>
          ) : null}
        </div>

        <div style={{ flex: "1 1 auto", overflowY: "auto", padding: "10px 8px", display: "flex", flexDirection: "column", gap: 2 }}>
          {nav.map((item) => (
            <button
              key={item.k}
              type="button"
              onClick={() => s.go(item.href)}
              title={item.label}
              aria-current={item.on ? "page" : undefined}
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                gap: 12,
                width: "100%",
                padding: "8px 10px 8px 12px",
                border: 0,
                borderRadius: "var(--r3)",
                background: item.bg,
                color: item.fg,
                fontSize: 14,
                fontWeight: item.weight,
                textAlign: "left",
                transition: "background 120ms ease-out",
              }}
            >
              <span
                aria-hidden
                style={{ position: "absolute", left: 0, top: 6, bottom: 6, width: 3, borderRadius: "0 2px 2px 0", background: item.rule }}
              />
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flex: "0 0 auto" }}>
                <path d={item.d} />
              </svg>
              {expanded ? <span style={{ whiteSpace: "nowrap" }}>{item.label}</span> : null}
            </button>
          ))}
        </div>

        <div style={{ borderTop: "1px solid var(--border)", padding: "14px 16px" }}>
          {expanded ? (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: "var(--fg2)" }}>Tokens this month</span>
              <span style={{ fontSize: 12, color: budget.fg, fontVariantNumeric: "tabular-nums" }}>{budget.pctLabel}</span>
            </div>
          ) : null}
          <div
            role="meter"
            aria-label="Monthly token budget used"
            aria-valuenow={budget.pct}
            style={{ height: 4, borderRadius: 2, background: "var(--sunken)", overflow: "hidden" }}
          >
            <div style={{ height: "100%", width: budget.width, background: budget.fill }} />
          </div>
          {expanded ? (
            <div style={{ marginTop: 8, fontSize: 12, color: "var(--fg2)", fontVariantNumeric: "tabular-nums" }}>{budget.label}</div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={s.toggleSidebar}
          aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
          style={{ border: 0, borderTop: "1px solid var(--border)", background: "transparent", color: "var(--fg3)", padding: "10px 16px", fontSize: 12, textAlign: "left" }}
        >
          {expanded ? "‹ Collapse" : "›"}
        </button>
      </nav>

      <div style={{ flex: "1 1 auto", minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <header
          style={{
            flex: "0 0 auto",
            zIndex: 30,
            display: "flex",
            alignItems: "center",
            gap: 16,
            height: 56,
            padding: "0 24px",
            background: "var(--chrome)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div style={{ flex: "0 0 auto", minWidth: 0, display: "flex", alignItems: "baseline", gap: 8 }}>
            {crumb ? (
              <>
                <button type="button" onClick={() => s.go(crumbHref)} style={{ border: 0, background: "transparent", padding: 0, color: "var(--fg3)", fontSize: 14 }}>
                  {crumb}
                </button>
                <span aria-hidden style={{ color: "var(--border-strong)" }}>/</span>
              </>
            ) : null}
            <h1 style={{ margin: 0, fontSize: 16, fontWeight: 600, letterSpacing: "-.01em", whiteSpace: "nowrap" }}>{pageTitle}</h1>
          </div>

          <div style={{ flex: "1 1 auto", display: "flex", justifyContent: "center", minWidth: 0 }}>
            <button
              type="button"
              onClick={() => s.setPalette(true)}
              aria-label="Search posts, goals and assets — ⌘K"
              style={{
                display: "flex",
                flex: narrow ? "0 0 auto" : "1 1 auto",
                alignItems: "center",
                gap: 10,
                minWidth: 0,
                maxWidth: 420,
                height: 34,
                padding: "0 10px",
                border: "1px solid var(--border)",
                borderRadius: "var(--r3)",
                background: "var(--surface2)",
                color: "var(--fg3)",
                fontSize: 13,
                textAlign: "left",
                whiteSpace: "nowrap",
                overflow: "hidden",
              }}
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden style={{ flex: "0 0 auto" }}>
                <circle cx="11" cy="11" r="6" />
                <path d="M20 20l-4.5-4.5" strokeLinecap="round" />
              </svg>
              {!narrow ? (
                <span style={{ flex: "1 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  Search posts, goals, assets
                </span>
              ) : null}
              {!narrow ? (
                <span
                  aria-hidden
                  style={{ flex: "0 0 auto", fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace", fontSize: 11, border: "1px solid var(--border)", borderRadius: "var(--r2)", padding: "1px 5px" }}
                >
                  ⌘K
                </span>
              ) : null}
            </button>
          </div>

          <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 12 }}>
            <button
              type="button"
              onClick={() => s.setSheet(true)}
              style={{ flex: "0 0 auto", height: 34, padding: "0 12px", border: 0, borderRadius: "var(--r3)", background: "var(--green)", color: "var(--on-green)", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}
            >
              {narrow ? "Generate" : "Generate now"}
            </button>

            {s.vw >= 900 ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, flex: "0 0 auto" }} aria-label="Platform connections">
                {conns.map((c) => (
                  <span key={c.short} title={c.title} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--fg2)" }}>
                    <span aria-hidden style={{ width: 7, height: 7, borderRadius: "50%", background: c.dot }} />
                    {c.short}
                  </span>
                ))}
              </div>
            ) : null}

            <div role="group" aria-label="Theme" style={{ display: "flex", padding: 2, gap: 2, border: "1px solid var(--border)", borderRadius: "var(--r3)", background: "var(--surface2)" }}>
              {themes.map((t) => {
                const on = s.theme === t.k;
                return (
                  <button
                    key={t.k}
                    type="button"
                    onClick={() => s.setTheme(t.k)}
                    aria-pressed={on}
                    title={t.label}
                    style={{ border: 0, borderRadius: "var(--r2)", padding: "3px 8px", fontSize: 12, background: on ? "var(--surface)" : "transparent", color: on ? "var(--fg)" : "var(--fg3)" }}
                  >
                    {t.glyph}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              aria-label="Account menu"
              style={{ width: 28, height: 28, borderRadius: "50%", border: "1px solid var(--border)", background: "var(--green-tint)", color: "var(--green-text)", fontSize: 12, fontWeight: 600 }}
            >
              AR
            </button>
          </div>
        </header>

        <main
          id="reds-main"
          style={{ flex: "1 1 auto", minWidth: 0, minHeight: 0, overflowY: "auto", overflowX: "hidden", padding: "24px 24px 80px", maxWidth: 1440, width: "100%" }}
        >
          {children}
        </main>
      </div>

      <Overlays />
    </div>
  );
}
