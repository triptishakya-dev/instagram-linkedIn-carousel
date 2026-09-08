"use client";

import { useEffect, useState } from "react";
import { PILL, STATES } from "@/lib/reds/data";
import { MONO, inr, inrCost, iso, num } from "@/lib/reds/format";
import { EmptyState } from "../charts";
import {
  ActivityCard,
  CARD,
  CaptionCard,
  CardTitle,
  GenerationCard,
  PLATFORM_ORDER,
  PlatformCard,
} from "../post-cards";
import { useReds } from "../store";
import type { Platform, Post } from "@/lib/reds/types";
import type { UsageReport } from "@/lib/usage/query";

export function PostDetail({ id }: { id: string }) {
  const s = useReds();
  const post = s.posts.find((p) => p.id === id) || s.posts[0];

  const [versionSel, setVersionSel] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState("");

  /**
   * This post's own usage, from the ledger.
   *
   * A scoped query rather than a slice of the shared report: the workspace
   * report is aggregated, and one post's caption-versus-image split is not
   * recoverable from it. The `Post` columns this card used to read hold only
   * the caption call -- images were never costed there at all.
   */
  const [postUsage, setPostUsage] = useState<UsageReport | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    setPostUsage(null);

    fetch(`/api/usage?postId=${encodeURIComponent(id)}`, { signal: ac.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.allTime) setPostUsage(data as UsageReport);
      })
      .catch(() => {
        /* the card falls back to showing nothing rather than a wrong figure */
      });

    return () => ac.abort();
  }, [id]);

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

  /**
   * Both halves of the run this post belongs to.
   *
   * Generation writes one post per platform, so the LinkedIn version of what
   * is on screen is a different row. Opening a card navigates to that row
   * rather than swapping content in place -- the caption editor and every
   * action below are bound to `post.id`, and re-pointing them at a sibling
   * would quietly edit a post the URL does not name.
   */
  const siblings = s.runSiblings(post);
  const postPlatform: Platform = post.platforms[0] ?? "instagram";
  const wide = s.vw >= 1100;

  // The ledger's totals for this post once they arrive, and the post's own
  // caption-only columns until then -- never a mix, so the header cannot show
  // ledger tokens beside a post-column cost.
  // Guarded on having events, not merely on the report having arrived: a post
  // generated before the ledger existed gets an empty report, and treating
  // that as authoritative showed "0 tokens / not priced" beside a card that
  // was correctly falling back to the post's own columns.
  const led = postUsage?.allTime.totals;
  const ledger = led && led.calls > 0 ? led : undefined;
  const meters = [
    { value: num(ledger?.tokens ?? tok), label: "tokens total" },
    {
      value:
        ledger != null
          ? ledger.costInr == null
            ? "not priced"
            : "est. " + inrCost(ledger.costInr)
          : "est. " + inrCost(post.usage.estimatedCostInr),
      label: "cost of iteration",
    },
    { value: (post.usage.generationMs / 1000).toFixed(1) + "s", label: "generation time" },
    { value: String(post.usage.runs), label: post.usage.runs === 1 ? "run" : "runs" },
  ];

  const patchSlides = (fn: (p: Post) => Post["slides"]) =>
    s.setPosts((ps) => ps.map((p) => (p.id === post.id ? { ...p, slides: fn(p) } : p)));

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

      {/*
        Main column and sidebar. `minmax(0, …)` on both tracks rather than a
        bare `3fr 1fr`: a grid item's default `min-width: auto` is its content,
        so one wide image or an unbroken caption line would push the track past
        its share and give the page a horizontal scrollbar.
      */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: wide ? "minmax(0, 3fr) minmax(0, 1fr)" : "minmax(0, 1fr)",
          gap: 20,
          alignItems: "start",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
          {/* ---- what each platform is getting ---- */}
          <div
            style={{
              display: "grid",
              // `min(270px, 100%)` rather than a bare 270px: a bare minimum is a
              // floor the track cannot go below, so in a container narrower
              // than one card the row overflows instead of wrapping. Clamping
              // it to the container keeps a single column honest at any width.
              gridTemplateColumns: "repeat(auto-fit, minmax(min(270px, 100%), 1fr))",
              gap: 16,
              alignItems: "stretch",
            }}
          >
            {PLATFORM_ORDER.map((k) => {
              const sib = siblings[k] ?? null;
              return (
                <PlatformCard
                  key={k}
                  platform={k}
                  post={sib}
                  active={sib?.id === post.id}
                  onOpen={sib ? () => s.go(`/posts/${sib.id}`) : undefined}
                />
              );
            })}
          </div>

          {/* ---- caption ---- */}
          <CaptionCard
            post={post}
            platform={postPlatform}
            onChange={(next) => s.patchPost(post.id, { caption: next })}
            onCopied={(ok) =>
              s.toast(ok ? "Caption copied to the clipboard" : "Could not reach the clipboard")
            }
          />

          {/* ---- hashtags ---- */}
          <div style={CARD}>
            <CardTitle>Hashtags</CardTitle>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
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

        <section aria-label="Post history and actions" style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
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
                          <span style={{ color: "var(--green-text)" }}>{post.slides[0]?.headline ?? ""}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            patchSlides((p) => p.slides.map((x, k) => (k === 0 ? { ...x, headline: v.headline, body: v.body } : x)));
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

        {/* ---- activity sidebar ---- */}
        <aside
          aria-label="Activity and generation details"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            minWidth: 0,
            // Sticky only where there is a column beside it to scroll past;
            // stacked under the main content it would pin to the viewport and
            // cover what the reader scrolled to.
            position: wide ? "sticky" : "static",
            top: wide ? 16 : undefined,
          }}
        >
          <ActivityCard post={post} now={s.now} />
          <GenerationCard
            post={post}
            modelLabel={model?.label ?? null}
            rows={(() => {
              const u = postUsage?.allTime;
              const money = (v: number | null | undefined) =>
                v == null ? "not priced" : "est. " + inrCost(v);

              // Until the ledger answers, the post's own recorded totals stand
              // in. They cover the caption call only, so they are labelled as
              // such rather than presented as the whole bill.
              if (!u || u.totals.calls === 0) {
                return [
                  { label: "Tokens (caption)", value: num(tok) },
                  { label: "Cost (caption)", value: money(post.usage.estimatedCostInr) },
                  { label: "Duration", value: (post.usage.generationMs / 1000).toFixed(1) + "s" },
                  { label: post.usage.runs === 1 ? "Run" : "Runs", value: String(post.usage.runs) },
                ];
              }

              return [
                { label: "Tokens", value: num(u.totals.tokens) },
                { label: "Total cost", value: money(u.totals.costInr) },
                { label: "Caption", value: `${num(u.byKind.caption.tokens)} tok · ${money(u.byKind.caption.costInr)}` },
                {
                  label: "Images",
                  value: `${u.byKind.image.images} · ${num(u.byKind.image.tokens)} tok · ${money(u.byKind.image.costInr)}`,
                },
                { label: "Calls", value: `${u.totals.ok} ok` + (u.totals.failed ? ` · ${u.totals.failed} failed` : "") },
                { label: "Duration", value: (post.usage.generationMs / 1000).toFixed(1) + "s" },
                { label: post.usage.runs === 1 ? "Run" : "Runs", value: String(post.usage.runs) },
              ];
            })()}
          />
        </aside>
      </div>
    </div>
  );
}
