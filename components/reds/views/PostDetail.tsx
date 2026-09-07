"use client";

import { useState } from "react";
import { PILL, STATES } from "@/lib/reds/data";
import { MONO, inr, iso, num } from "@/lib/reds/format";
import { EmptyState } from "../charts";
import { useReds } from "../store";
import type { Post, SlideLayout } from "@/lib/reds/types";

const LAYOUTS: SlideLayout[] = ["cover", "statement", "split", "list", "cta"];

const TOOL_BTN: React.CSSProperties = {
  padding: "4px 9px",
  border: "1px solid var(--border)",
  borderRadius: "var(--r2)",
  background: "var(--surface)",
  color: "var(--fg2)",
  fontSize: 11,
};

const CARD: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "var(--r4)",
  background: "var(--surface)",
  padding: 14,
};

export function PostDetail({ id }: { id: string }) {
  const s = useReds();
  const post = s.posts.find((p) => p.id === id) || s.posts[0];

  const [slideIdx, setSlideIdx] = useState(0);
  const [platform, setPlatform] = useState<"instagram" | "linkedin">("instagram");
  const [safeArea, setSafeArea] = useState(false);
  const [scope, setScope] = useState<"slide" | "all" | "caption">("slide");
  const [promptDraft, setPromptDraft] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [genStatus, setGenStatus] = useState("");
  const [genError, setGenError] = useState<string | null>(null);
  const [genRaw, setGenRaw] = useState("");
  const [cfKey, setCfKey] = useState(0);
  const [versionSel, setVersionSel] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [dragFrom, setDragFrom] = useState<number | null>(null);

  if (!post) {
    return (
      <EmptyState
        title="That post is not in this workspace"
        body="It may have been deleted, or the link points at a post from another session."
        actionLabel="Back to posts"
        onAction={() => s.go("/posts")}
      />
    );
  }

  const goal = s.goalById(post.goalId);
  const model = s.modelById(post.usage.modelId);
  const st = STATES[post.state];
  const pill = PILL[st.t];
  const tok = post.usage.inputTokens + post.usage.outputTokens;

  const idx = Math.min(slideIdx, post.slides.length - 1);
  const sl = post.slides[idx];
  const asset = s.assetById(sl.assetId);
  const ig = platform === "instagram";

  const slide = {
    layout: sl.layout,
    headline: sl.headline,
    body: sl.body,
    items: sl.body.split(/(?<=\.)\s+/).slice(0, 3),
    assetTint: asset?.tint || "var(--n100)",
    assetLabel: asset ? `${asset.name} — ${asset.width}×${asset.height}` : "no asset",
    isCover: sl.layout === "cover",
    isList: sl.layout === "list",
    isProse: sl.layout !== "list" && sl.layout !== "cta",
    isCta: sl.layout === "cta",
    justify: sl.layout === "cover" ? "flex-end" : sl.layout === "statement" ? "center" : "flex-start",
    pad: ig ? 32 : 40,
    headSize: sl.layout === "statement" ? 32 : 24,
  };

  const promptText = promptDraft != null ? promptDraft : (goal?.captionPrompt ?? "");
  const overridden = promptDraft != null && promptDraft !== (goal?.captionPrompt ?? "");

  const meters = [
    { value: num(tok), label: "tokens total" },
    { value: "est. " + inr(post.usage.estimatedCostInr), label: "cost of iteration" },
    { value: (post.usage.generationMs / 1000).toFixed(1) + "s", label: "generation time" },
    { value: String(post.usage.runs), label: post.usage.runs === 1 ? "run" : "runs" },
  ];

  /**
   * Runs the prompt for the current scope. The provider call is not wired yet,
   * so this reports why nothing happened rather than inventing slide copy.
   */
  const generate = () => {
    if (streaming) return;
    setGenRaw("");
    setGenStatus("");
    setGenError(
      model
        ? "Generation is not connected yet. Wire a provider in Accounts to run this prompt."
        : "No model is configured for this post. Add one in Accounts, then set it on the goal.",
    );
  };

  const patchSlides = (fn: (p: Post) => Post["slides"]) =>
    s.setPosts((ps) => ps.map((p) => (p.id === post.id ? { ...p, slides: fn(p) } : p)));

  const cycleLayout = () => {
    const nx = LAYOUTS[(LAYOUTS.indexOf(sl.layout) + 1) % LAYOUTS.length];
    patchSlides((p) => p.slides.map((x, k) => (k === idx ? { ...x, layout: nx } : x)));
    setCfKey((k) => k + 1);
  };

  const scopes = [
    { k: "slide" as const, label: "This slide" },
    { k: "all" as const, label: "All slides" },
    { k: "caption" as const, label: "Caption only" },
  ];

  const footerActions = [
    { label: "Save draft", border: "1px solid var(--border)", bg: "var(--surface)", fg: "var(--fg2)", weight: 400, run: () => s.toast("Draft saved") },
    { label: "Schedule post", border: "1px solid var(--border)", bg: "var(--surface)", fg: "var(--fg2)", weight: 400, run: () => { s.patchPost(post.id, { state: "scheduled" }); s.toast("Post scheduled"); } },
    { label: "Approve", border: "1px solid var(--green-line)", bg: "var(--green-tint)", fg: "var(--green-text)", weight: 600, run: () => { s.patchPost(post.id, { state: "ready" }); s.toast("Post approved"); } },
    { label: "Publish now", border: "0", bg: "var(--green)", fg: "var(--on-green)", weight: 600, run: () => { s.patchPost(post.id, { state: "published", publishedAt: iso(Date.now()) }); s.toast("Post published to " + post.platforms.join(" and ")); } },
  ];

  const versions = post.versions.slice().reverse();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* ---- header strip ---- */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 20, paddingBottom: 12, borderBottom: "1px solid var(--border-strong)" }}>
        <span style={{ fontFamily: MONO, fontSize: 14 }}>{post.id}</span>
        {goal ? (
          <button type="button" onClick={() => s.go(`/goals/${goal.id}`)} style={{ border: 0, background: "transparent", padding: 0, fontSize: 13, color: "var(--green-text)" }}>
            {goal.name}
          </button>
        ) : (
          <span style={{ fontSize: 13, color: "var(--fg3)" }}>No goal</span>
        )}
        <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: pill.bg, color: pill.fg, border: `1px solid ${pill.br}` }}>{st.l}</span>
        <span style={{ flex: "1 1 auto" }} />
        {meters.map((m) => (
          <span key={m.label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontFamily: MONO, fontSize: 14 }}>{m.value}</span>
            <span style={{ fontSize: 12, color: "var(--fg2)" }}>{m.label}</span>
          </span>
        ))}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" }}>
        {/* ---- carousel preview ---- */}
        <section aria-label="Carousel preview" style={{ flex: "1 1 540px", minWidth: 340 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <div role="group" aria-label="Platform ratio" style={{ display: "flex", gap: 2, padding: 2, border: "1px solid var(--border)", borderRadius: "var(--r3)", background: "var(--surface2)" }}>
              {([{ k: "instagram", label: "IG 4:5" }, { k: "linkedin", label: "LI 1:1" }] as const).map((p) => {
                const on = platform === p.k;
                return (
                  <button key={p.k} type="button" aria-pressed={on} onClick={() => setPlatform(p.k)} style={{ border: 0, borderRadius: "var(--r2)", padding: "4px 10px", fontSize: 12, background: on ? "var(--surface)" : "transparent", color: on ? "var(--fg)" : "var(--fg3)" }}>
                    {p.label}
                  </button>
                );
              })}
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--fg2)" }}>
              <input type="checkbox" checked={safeArea} onChange={() => setSafeArea(!safeArea)} style={{ accentColor: "var(--green-line)" }} />
              Crop guides
            </label>
            <span style={{ flex: "1 1 auto" }} />
            <span style={{ fontSize: 12, color: "var(--fg3)" }}>
              Slide {idx + 1} of {post.slides.length} — {slide.layout}
            </span>
          </div>

          <div
            tabIndex={0}
            role="group"
            aria-label="Slide stage — left and right arrow keys move between slides"
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") { e.preventDefault(); setSlideIdx(Math.min(post.slides.length - 1, idx + 1)); setCfKey((k) => k + 1); }
              if (e.key === "ArrowLeft") { e.preventDefault(); setSlideIdx(Math.max(0, idx - 1)); setCfKey((k) => k + 1); }
            }}
            style={{ position: "relative", width: "100%", maxWidth: ig ? 440 : 540, aspectRatio: ig ? "4 / 5" : "1 / 1", background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: "var(--r4)", overflow: "hidden" }}
          >
            <div key={`cf${cfKey}-${idx}`} style={{ position: "absolute", inset: 0, animation: "reds-cf 200ms ease-out" }}>
              <div aria-hidden style={{ position: "absolute", inset: 0, background: slide.assetTint }} />
              <div aria-hidden style={{ position: "absolute", left: 12, bottom: 10, fontFamily: MONO, fontSize: 11, color: "var(--fg3)" }}>{slide.assetLabel}</div>
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: slide.justify, gap: 14, padding: slide.pad }}>
                {slide.isCover ? (
                  <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".24em", color: "var(--green-text)" }}>REDS</span>
                ) : null}
                <h3 style={{ margin: 0, fontSize: slide.headSize, lineHeight: 1.15, fontWeight: 600, letterSpacing: "-.02em", color: "var(--fg)", maxWidth: "22ch" }}>
                  {slide.headline}
                  <span aria-hidden style={{ color: "var(--green-line)", animation: "reds-caret 700ms steps(1) infinite", opacity: streaming ? 1 : 0 }}>|</span>
                </h3>
                {slide.isList ? (
                  <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8, maxWidth: "34ch" }}>
                    {slide.items.map((it, i) => (
                      <li key={i} style={{ display: "flex", gap: 10, fontSize: 16, color: "var(--fg2)", lineHeight: 1.5 }}>
                        <span aria-hidden style={{ color: "var(--green-line)" }}>—</span>
                        {it}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {slide.isProse ? (
                  <p style={{ margin: 0, fontSize: 16, lineHeight: 1.5, color: "var(--fg2)", maxWidth: "38ch" }}>{slide.body}</p>
                ) : null}
                {slide.isCta ? (
                  <span style={{ alignSelf: "flex-start", padding: "8px 14px", borderRadius: "var(--r3)", background: "var(--green)", color: "var(--on-green)", fontSize: 14, fontWeight: 600 }}>
                    Read the project notes
                  </span>
                ) : null}
              </div>
              {safeArea ? (
                <div aria-hidden style={{ position: "absolute", inset: "7%", border: "1px dashed var(--border-strong)", borderRadius: "var(--r2)" }} />
              ) : null}
            </div>

            {streaming ? (
              <div aria-hidden style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 3, background: "var(--green-tint2)", overflow: "hidden" }}>
                <div style={{ height: "100%", background: "var(--green)", transformOrigin: "left", animation: "reds-prog 2600ms ease-out forwards" }} />
              </div>
            ) : null}

            <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 6 }}>
              <button type="button" onClick={() => s.setPicker({ kind: "image", field: "imageAssetIds", multi: false })} style={TOOL_BTN}>
                Swap asset
              </button>
              <button type="button" onClick={cycleLayout} style={TOOL_BTN}>
                Change layout
              </button>
              <button type="button" onClick={() => { setScope("slide"); generate(); }} style={TOOL_BTN}>
                Regenerate slide
              </button>
            </div>
          </div>

          {/* ---- filmstrip ---- */}
          <div role="tablist" aria-label="Slides" style={{ display: "flex", gap: 10, marginTop: 14, overflowX: "auto", padding: "6px 2px 8px" }}>
            {post.slides.map((x, i) => {
              const on = i === idx;
              const a = s.assetById(x.assetId);
              return (
                <div
                  key={i}
                  draggable
                  onDragStart={() => setDragFrom(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragFrom == null || dragFrom === i) return;
                    patchSlides((p) => {
                      const arr = p.slides.slice();
                      const [m] = arr.splice(dragFrom, 1);
                      arr.splice(i, 0, m);
                      return arr.map((sl2, k) => ({ ...sl2, index: k }));
                    });
                    setDragFrom(null);
                    setSlideIdx(i);
                    setCfKey((k) => k + 1);
                    s.toast("Slide order changed");
                  }}
                  style={{ flex: "0 0 auto", position: "relative" }}
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => { setSlideIdx(i); setCfKey((k) => k + 1); }}
                    style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 52, height: 66, padding: 5, border: `1px solid ${on ? "var(--green-line)" : "var(--border)"}`, borderRadius: "var(--r2)", background: a?.tint || "var(--n100)", color: "var(--fg3)", fontFamily: MONO, fontSize: 10, textAlign: "left" }}
                  >
                    <span style={{ color: on ? "var(--green-text)" : "var(--fg3)" }}>{String(i + 1).padStart(2, "0")}</span>
                    <span>{x.layout.slice(0, 5)}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={"Remove slide " + (i + 1)}
                    onClick={() => {
                      if (post.slides.length < 2) return;
                      patchSlides((p) => p.slides.filter((_, k) => k !== i).map((sl2, k) => ({ ...sl2, index: k })));
                      setSlideIdx(Math.max(0, Math.min(idx, post.slides.length - 2)));
                      s.toast("Slide removed");
                    }}
                    style={{ position: "absolute", top: -6, right: -6, width: 16, height: 16, borderRadius: "50%", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--fg3)", fontSize: 10, lineHeight: 1, padding: 0 }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
            <button
              type="button"
              aria-label="Add slide"
              onClick={() => {
                patchSlides((p) => [
                  ...p.slides,
                  { index: p.slides.length, assetId: s.assets[p.slides.length % s.assets.length].id, headline: "New slide", body: "", layout: "statement" as SlideLayout },
                ]);
                setSlideIdx(post.slides.length);
              }}
              style={{ flex: "0 0 auto", width: 52, height: 66, border: "1px dashed var(--border-strong)", borderRadius: "var(--r2)", background: "transparent", color: "var(--fg3)", fontSize: 16 }}
            >
              +
            </button>
          </div>
        </section>

        {/* ---- generation console ---- */}
        <section aria-label="Generation console" style={{ flex: "1 1 380px", minWidth: 320, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={CARD}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Prompt</h2>
              <span style={{ fontSize: 11, padding: "1px 7px", borderRadius: 999, background: overridden ? "var(--amber-bg)" : "var(--n100)", color: overridden ? "var(--amber)" : "var(--fg2)", border: `1px solid ${overridden ? "var(--amber-br)" : "var(--border)"}` }}>
                {overridden ? "Overridden for this post" : "Inherited from goal"}
              </span>
              <span style={{ flex: "1 1 auto" }} />
              <button type="button" onClick={() => setPromptDraft(null)} style={{ border: 0, background: "transparent", padding: 0, fontSize: 12, color: "var(--green-text)" }}>
                Reset to goal prompt
              </button>
            </div>
            <textarea
              value={promptText}
              onChange={(e) => setPromptDraft(e.target.value)}
              rows={5}
              aria-label="Generation prompt"
              style={{ width: "100%", padding: 10, border: "1px solid var(--border)", borderRadius: "var(--r3)", background: "var(--surface2)", color: "var(--fg)", fontFamily: MONO, fontSize: 12, lineHeight: 1.5, resize: "vertical" }}
            />
            <div role="group" aria-label="Regeneration scope" style={{ display: "flex", gap: 2, padding: 2, marginTop: 10, border: "1px solid var(--border)", borderRadius: "var(--r3)", background: "var(--surface2)" }}>
              {scopes.map((x) => {
                const on = scope === x.k;
                return (
                  <button key={x.k} type="button" aria-pressed={on} onClick={() => setScope(x.k)} style={{ flex: "1 1 0", border: 0, borderRadius: "var(--r2)", padding: "5px 8px", fontSize: 12, background: on ? "var(--surface)" : "transparent", color: on ? "var(--fg)" : "var(--fg3)" }}>
                    {x.label}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginTop: 12 }}>
              <button type="button" onClick={generate} style={{ padding: "8px 14px", border: 0, borderRadius: "var(--r3)", background: "var(--green)", color: "var(--on-green)", fontSize: 13, fontWeight: 600, opacity: streaming ? 0.55 : 1 }}>
                {streaming ? "Generating…" : "Generate"}
              </button>
              {streaming ? (
                <button
                  type="button"
                  onClick={() => { setStreaming(false); setGenStatus("Run cancelled. The slide keeps whatever landed."); }}
                  style={{ padding: "7px 12px", border: "1px solid var(--border)", borderRadius: "var(--r3)", background: "var(--surface)", color: "var(--fg2)", fontSize: 12 }}
                >
                  Cancel
                </button>
              ) : null}
              <span style={{ fontSize: 12, color: "var(--fg2)" }}>
                {model ? `est. ${inr((scope === "all" ? post.slides.length : 1) * 420)} — ${model.label}` : "No model set on this goal"}
              </span>
            </div>
            <p aria-live="polite" style={{ margin: "10px 0 0", fontSize: 12, color: "var(--fg2)", minHeight: 18 }}>{genStatus}</p>
            {genError ? (
              <div style={{ marginTop: 10, padding: 10, border: "1px solid var(--red-br)", borderRadius: "var(--r3)", background: "var(--red-bg)" }}>
                <p style={{ margin: "0 0 6px", fontSize: 13, color: "var(--red)" }}>{genError}</p>
                {genRaw ? (
                  <details>
                    <summary style={{ fontSize: 12, color: "var(--fg2)", cursor: "pointer" }}>View the raw response</summary>
                    <pre style={{ margin: "8px 0 0", maxHeight: 140, overflow: "auto", fontFamily: MONO, fontSize: 11, color: "var(--fg2)", whiteSpace: "pre-wrap" }}>{genRaw}</pre>
                  </details>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* ---- caption ---- */}
          <div style={CARD}>
            <h2 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 600 }}>Caption</h2>
            <textarea
              value={post.caption}
              onChange={(e) => s.patchPost(post.id, { caption: e.target.value })}
              rows={4}
              aria-label="Post caption"
              style={{ width: "100%", padding: 10, border: "1px solid var(--border)", borderRadius: "var(--r3)", background: "var(--surface2)", color: "var(--fg)", fontSize: 13, lineHeight: 1.5, resize: "vertical" }}
            />
            <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 12, fontFamily: MONO }}>
              <span style={{ color: post.caption.length > 2200 ? "var(--red)" : "var(--fg2)" }}>IG {post.caption.length} / 2,200</span>
              <span style={{ color: post.caption.length > 3000 ? "var(--red)" : "var(--fg2)" }}>LI {post.caption.length} / 3,000</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
              {post.hashtags.map((h, i) => (
                <span key={h + i} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 8px", border: "1px solid var(--border)", borderRadius: 999, fontSize: 12, color: "var(--fg2)" }}>
                  {h}
                  <button
                    type="button"
                    aria-label={"Remove " + h}
                    onClick={() => s.patchPost(post.id, { hashtags: post.hashtags.filter((_, k) => k !== i) })}
                    style={{ border: 0, background: "transparent", padding: 0, color: "var(--fg3)", fontSize: 12 }}
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && tagDraft.trim()) {
                    const t = tagDraft.trim();
                    s.patchPost(post.id, { hashtags: [...post.hashtags, t.startsWith("#") ? t : "#" + t] });
                    setTagDraft("");
                  }
                }}
                placeholder="Add hashtag"
                aria-label="Add hashtag"
                style={{ padding: "3px 10px", border: "1px dashed var(--border-strong)", borderRadius: 999, background: "transparent", fontSize: 12, width: 130 }}
              />
            </div>
          </div>

          {/* ---- version history ---- */}
          <div style={CARD}>
            <h2 style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600 }}>Version history</h2>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {versions.map((v, i) => {
                const on = versionSel === v.id;
                return (
                  <li key={v.id} style={{ borderTop: "1px solid var(--border)", padding: "9px 0" }}>
                    <button
                      type="button"
                      aria-expanded={on}
                      onClick={() => setVersionSel(on ? null : v.id)}
                      style={{ display: "flex", alignItems: "baseline", gap: 10, width: "100%", border: 0, background: "transparent", padding: 0, textAlign: "left" }}
                    >
                      <span style={{ fontSize: 13, color: on ? "var(--green-text)" : "var(--fg)", fontWeight: i === 0 ? 600 : 400 }}>{v.label}</span>
                      <span style={{ fontSize: 12, color: "var(--fg3)" }}>{v.scope}</span>
                      <span style={{ flex: "1 1 auto" }} />
                      <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--fg2)" }}>
                        {num(v.tokens)} tok · est. {inr(v.cost)}
                      </span>
                    </button>
                    {on ? (
                      <div style={{ marginTop: 10, padding: 10, border: "1px solid var(--border)", borderRadius: "var(--r3)", background: "var(--surface2)" }}>
                        <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--fg2)" }}>{v.note}</p>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
                          <span style={{ color: "var(--fg3)", textDecoration: "line-through" }}>{v.headline}</span>
                          <span style={{ color: "var(--green-text)" }}>{post.slides[0].headline}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            patchSlides((p) => p.slides.map((x, k) => (k === 0 ? { ...x, headline: v.headline, body: v.body } : x)));
                            setCfKey((k) => k + 1);
                            setVersionSel(null);
                            s.toast(v.label + " restored");
                          }}
                          style={{ marginTop: 10, padding: "5px 11px", border: "1px solid var(--green-line)", borderRadius: "var(--r3)", background: "var(--green-tint)", color: "var(--green-text)", fontSize: 12, fontWeight: 600 }}
                        >
                          Restore this version
                        </button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            {footerActions.map((a) => (
              <button key={a.label} type="button" onClick={a.run} style={{ padding: "7px 13px", border: a.border, borderRadius: "var(--r3)", background: a.bg, color: a.fg, fontSize: 13, fontWeight: a.weight }}>
                {a.label}
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
