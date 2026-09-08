"use client";

/**
 * The cards the post detail view is built from.
 *
 * Split out of `views/PostDetail.tsx` because that file is the slide editor and
 * was already long; these are presentational and have no editor state. They
 * take a `Post` (or null) and render it, so the "what goes out to Instagram
 * versus LinkedIn" question is answered by two instances of one component
 * rather than two hand-tuned blocks that drift apart.
 */

import { useState } from "react";
import { PILL, STATES } from "@/lib/reds/data";
import { MONO, absDT, relDT } from "@/lib/reds/format";
import type { Platform, Post } from "@/lib/reds/types";

/** One radius, one border, one padding, everywhere on this page. */
export const CARD: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "var(--r4)",
  background: "var(--surface)",
  padding: 14,
};

export function CardTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
      <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--fg)" }}>{children}</h2>
      <span style={{ flex: "1 1 auto" }} />
      {right}
    </div>
  );
}

/* ------------------------------------------------------------- platforms -- */

/**
 * Everything platform-specific in one table.
 *
 * `ratio` and `limit` were previously inline ternaries in the editor, which is
 * why the caption card counted both platforms' limits against one post that
 * only publishes to one of them.
 */
export const PLATFORM_META: Record<
  Platform,
  { label: string; ratio: string; aspect: string; limit: number; fg: string; bg: string; br: string }
> = {
  instagram: {
    label: "Instagram",
    ratio: "4:5",
    aspect: "4 / 5",
    limit: 2200,
    fg: "var(--ig)",
    bg: "var(--ig-bg)",
    br: "var(--ig-br)",
  },
  linkedin: {
    label: "LinkedIn",
    ratio: "1:1",
    aspect: "1 / 1",
    limit: 3000,
    fg: "var(--li)",
    bg: "var(--li-bg)",
    br: "var(--li-br)",
  },
};

export const PLATFORM_ORDER: Platform[] = ["instagram", "linkedin"];

/**
 * Brand glyphs as inline SVG.
 *
 * No icon package is installed -- every icon in this app is an inline 24x24
 * path on `currentColor` (see `Shell.tsx`), so these follow that rather than
 * pulling in a dependency for two shapes.
 */
export function PlatformIcon({ platform, size = 18 }: { platform: Platform; size?: number }) {
  const common = {
    viewBox: "0 0 24 24",
    width: size,
    height: size,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    style: { flex: "0 0 auto" },
  };

  if (platform === "instagram") {
    return (
      <svg {...common}>
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <rect x="3" y="3" width="18" height="18" rx="2.5" />
      <path d="M7.5 10.5V17" />
      <circle cx="7.5" cy="7.4" r="1" fill="currentColor" stroke="none" />
      <path d="M11.5 17v-3.6a2.1 2.1 0 014.2 0V17" />
    </svg>
  );
}

function StatusPill({ post }: { post: Post }) {
  const st = STATES[post.state];
  const pill = PILL[st.t];
  return (
    <span
      style={{
        fontSize: 11,
        padding: "2px 8px",
        borderRadius: 999,
        background: pill.bg,
        color: pill.fg,
        border: `1px solid ${pill.br}`,
        whiteSpace: "nowrap",
      }}
    >
      {st.l}
    </span>
  );
}

/**
 * What one platform is actually getting.
 *
 * `post` is null when the run produced nothing for this platform -- a run
 * targeting Instagram only still renders a LinkedIn card, because "nothing is
 * going to LinkedIn" is the answer the page exists to give.
 */
export function PlatformCard({
  platform,
  post,
  active,
  onOpen,
}: {
  platform: Platform;
  post: Post | null;
  active: boolean;
  onOpen?: () => void;
}) {
  const meta = PLATFORM_META[platform];
  const [hover, setHover] = useState(false);

  /**
   * Which slide this card is showing.
   *
   * Held per card, so the two platforms browse independently -- their runs
   * produce different slide counts (eight against six here) and stepping one
   * has no meaning for the other.
   */
  const [slideIdx, setSlideIdx] = useState(0);

  const count = post?.slides.length ?? 0;
  // Clamped rather than trusted: the same card can be handed a different post
  // when the reader opens the sibling, and the new one may be shorter.
  const idx = count ? Math.min(slideIdx, count - 1) : 0;
  const slide = post?.slides[idx];

  const step = (delta: number) => setSlideIdx(Math.max(0, Math.min(count - 1, idx + delta)));

  const interactive = !!post && !!onOpen && !active;

  return (
    <section
      aria-label={`${meta.label} preview`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...CARD,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        minWidth: 0,
        borderColor: active ? meta.br : "var(--border)",
        boxShadow: active || (interactive && hover) ? "var(--shadow)" : "none",
        transition: "box-shadow 140ms ease, border-color 140ms ease",
      }}
    >
      {/* ---- card head ---- */}
      <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
        <span
          aria-hidden
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 30,
            height: 30,
            borderRadius: "var(--r3)",
            background: meta.bg,
            border: `1px solid ${meta.br}`,
            color: meta.fg,
            flex: "0 0 auto",
          }}
        >
          <PlatformIcon platform={platform} />
        </span>
        <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--fg)" }}>{meta.label}</span>
          <span style={{ fontSize: 11, color: "var(--fg3)", fontFamily: MONO }}>
            {meta.ratio}
            {post ? ` · ${post.slides.length} ${post.slides.length === 1 ? "slide" : "slides"}` : ""}
          </span>
        </span>
        <span style={{ flex: "1 1 auto" }} />
        {post ? <StatusPill post={post} /> : null}
      </div>

      {/* ---- visual preview ---- */}
      {post && slide ? (
        <div
          // Focusable so the arrow keys work here the way they did on the old
          // slide stage; the buttons below are the discoverable path.
          tabIndex={count > 1 ? 0 : -1}
          role={count > 1 ? "group" : undefined}
          aria-label={count > 1 ? `${meta.label} slides — left and right arrow keys step through them` : undefined}
          onKeyDown={(e) => {
            if (count < 2) return;
            if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
            if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
          }}
          style={{
            position: "relative",
            width: "100%",
            aspectRatio: meta.aspect,
            borderRadius: "var(--r3)",
            overflow: "hidden",
            background: "var(--surface2)",
            border: "1px solid var(--border)",
          }}
        >
          {slide.previewUrl ? (
            <img
              src={slide.previewUrl}
              alt={`${meta.label} slide ${idx + 1} of ${count}`}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <span
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                color: "var(--fg3)",
              }}
            >
              No image rendered
            </span>
          )}

          {/*
            The next slide, painted underneath at zero opacity purely so the
            browser fetches it. These are signed URLs off S3 and a cold one
            takes long enough to flash empty on the step.
          */}
          {count > 1 && post.slides[idx + 1]?.previewUrl ? (
            <img src={post.slides[idx + 1].previewUrl} alt="" aria-hidden style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }} />
          ) : null}

          {count > 1 ? (
            <>
              <span
                style={{
                  position: "absolute",
                  right: 8,
                  top: 8,
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: "rgba(0,0,0,.62)",
                  color: "#fff",
                  fontFamily: MONO,
                  fontSize: 11,
                }}
              >
                {idx + 1} / {count}
              </span>

              {([
                { dir: -1, label: "Previous slide", side: "left", d: "M14.5 5L8 12l6.5 7" },
                { dir: 1, label: "Next slide", side: "right", d: "M9.5 5L16 12l-6.5 7" },
              ] as const).map((nav) => {
                const disabled = nav.dir < 0 ? idx === 0 : idx === count - 1;
                return (
                  <button
                    key={nav.side}
                    type="button"
                    aria-label={nav.label}
                    disabled={disabled}
                    onClick={() => step(nav.dir)}
                    style={{
                      position: "absolute",
                      top: "50%",
                      [nav.side]: 8,
                      transform: "translateY(-50%)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 30,
                      height: 30,
                      padding: 0,
                      borderRadius: "50%",
                      border: "1px solid rgba(255,255,255,.22)",
                      background: "rgba(0,0,0,.55)",
                      color: "#fff",
                      // Dimmed rather than hidden at the ends: a control that
                      // vanishes mid-carousel moves the other one under the
                      // cursor and makes the reader re-aim.
                      opacity: disabled ? 0.28 : hover ? 1 : 0.72,
                      cursor: disabled ? "default" : "pointer",
                      transition: "opacity 140ms ease, background 140ms ease",
                    }}
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d={nav.d} />
                    </svg>
                  </button>
                );
              })}
            </>
          ) : null}
        </div>
      ) : (
        <div
          style={{
            width: "100%",
            aspectRatio: meta.aspect,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            padding: 16,
            textAlign: "center",
            borderRadius: "var(--r3)",
            border: "1px dashed var(--border-strong)",
            background: "var(--surface2)",
          }}
        >
          <span aria-hidden style={{ color: "var(--fg3)" }}>
            <PlatformIcon platform={platform} size={26} />
          </span>
          <span style={{ fontSize: 13, color: "var(--fg2)" }}>
            No {meta.label} content generated yet.
          </span>
        </div>
      )}

      {/* ---- caption excerpt + footer ---- */}
      {post ? (
        <>
          <p
            style={{
              margin: 0,
              fontSize: 12,
              lineHeight: 1.55,
              color: "var(--fg2)",
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {post.caption || "No caption written."}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: "auto" }}>
            <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--fg3)" }}>
              {post.caption.length.toLocaleString()} / {meta.limit.toLocaleString()} chars
            </span>
            <span style={{ flex: "1 1 auto" }} />
            {active ? (
              <span style={{ fontSize: 11, color: meta.fg, fontWeight: 600 }}>Editing this</span>
            ) : onOpen ? (
              <button
                type="button"
                onClick={onOpen}
                style={{
                  padding: "4px 10px",
                  border: `1px solid ${hover ? meta.br : "var(--border)"}`,
                  borderRadius: "var(--r2)",
                  background: hover ? meta.bg : "var(--surface)",
                  color: hover ? meta.fg : "var(--fg2)",
                  fontSize: 11,
                  transition: "background 140ms ease, color 140ms ease, border-color 140ms ease",
                }}
              >
                Open
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}

/* --------------------------------------------------------------- caption -- */

/**
 * The caption card.
 *
 * Editable, because it always was: the textarea and its `onChange` are the
 * existing wiring, and replacing them with read-only prose would have removed
 * the only way to fix a generated caption. Copy, the count and the platform
 * badge are additions around it.
 */
export function CaptionCard({
  post,
  platform,
  onChange,
  onCopied,
}: {
  post: Post;
  platform: Platform;
  onChange: (next: string) => void;
  onCopied: (ok: boolean) => void;
}) {
  const meta = PLATFORM_META[platform];
  const [copied, setCopied] = useState(false);
  const over = post.caption.length > meta.limit;

  /**
   * Copy, with the old selection trick behind the modern API.
   *
   * `navigator.clipboard.writeText` is permission-gated: it rejects with
   * NotAllowedError under a restrictive permissions policy and is absent
   * entirely over plain http. `execCommand("copy")` is deprecated but is not
   * gated the same way, so it covers those cases. Only when both fail does
   * this report a failure -- showing a "Copied" that did not copy is worse
   * than saying so.
   */
  const copy = async () => {
    const text = post.caption;

    const viaSelection = () => {
      const el = document.createElement("textarea");
      el.value = text;
      // Off-screen but still selectable; `display: none` cannot be selected.
      el.style.cssText = "position:fixed;top:-1000px;opacity:0";
      document.body.appendChild(el);
      el.select();
      try {
        return document.execCommand("copy");
      } finally {
        document.body.removeChild(el);
      }
    };

    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      try {
        ok = viaSelection();
      } catch {
        ok = false;
      }
    }

    onCopied(ok);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div style={CARD}>
      <CardTitle
        right={
          <>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "2px 8px",
                borderRadius: 999,
                background: meta.bg,
                border: `1px solid ${meta.br}`,
                color: meta.fg,
                fontSize: 11,
              }}
            >
              <PlatformIcon platform={platform} size={12} />
              {meta.label}
            </span>
            <button
              type="button"
              onClick={copy}
              aria-live="polite"
              style={{
                padding: "4px 11px",
                border: `1px solid ${copied ? "var(--green-line)" : "var(--border)"}`,
                borderRadius: "var(--r2)",
                background: copied ? "var(--green-tint)" : "var(--surface)",
                color: copied ? "var(--green-text)" : "var(--fg2)",
                fontSize: 11,
                fontWeight: copied ? 600 : 400,
                transition: "background 140ms ease, color 140ms ease, border-color 140ms ease",
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </>
        }
      >
        Generated Caption
      </CardTitle>

      <textarea
        value={post.caption}
        onChange={(e) => onChange(e.target.value)}
        rows={9}
        aria-label="Post caption"
        style={{
          width: "100%",
          padding: 12,
          border: "1px solid var(--border)",
          borderRadius: "var(--r3)",
          background: "var(--surface2)",
          color: "var(--fg)",
          fontSize: 13,
          // Generated captions carry blank lines between the body, the prompt
          // and the hashtag block; a collapsed line-height loses that shape.
          lineHeight: 1.65,
          resize: "vertical",
          whiteSpace: "pre-wrap",
        }}
      />

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14, marginTop: 8 }}>
        <span style={{ fontFamily: MONO, fontSize: 12, color: over ? "var(--red)" : "var(--fg2)" }}>
          {post.caption.length.toLocaleString()} / {meta.limit.toLocaleString()} characters
        </span>
        {over ? (
          <span style={{ fontSize: 12, color: "var(--red)" }}>
            Over the {meta.label} limit — it will be truncated on publish.
          </span>
        ) : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- activity -- */

type Stamp = { key: string; label: string; at: string | null };

/**
 * The timeline, from the timestamps the post actually carries.
 *
 * Deliberately not a fixed list of rows: an unscheduled draft has no
 * `scheduledFor` and an unpublished one has no `publishedAt`, and rendering
 * those as "—" says nothing. Empty entries are dropped instead.
 *
 * There is no "generated at" here because no such column reaches the client --
 * the post carries `generationMs`, a duration, and the run's own finish time
 * lives on `GenerationRun`, which this view never loads.
 */
export function ActivityCard({ post, now }: { post: Post; now: number | null }) {
  const stamps: Stamp[] = [
    { key: "created", label: "Created", at: post.createdAt },
    { key: "updated", label: "Last updated", at: post.updatedAt },
    { key: "scheduled", label: "Scheduled for", at: post.scheduledFor },
    { key: "published", label: "Published", at: post.publishedAt },
  ].filter((x): x is Stamp => !!x.at);

  return (
    <div style={CARD}>
      <CardTitle>Activity</CardTitle>

      {stamps.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: "var(--fg2)" }}>
          No timestamps recorded for this post yet.
        </p>
      ) : (
        <ol style={{ listStyle: "none", margin: 0, padding: 0, position: "relative" }}>
          {stamps.map((x, i) => {
            const last = i === stamps.length - 1;
            return (
              <li key={x.key} style={{ display: "flex", gap: 10, minHeight: last ? 0 : 46 }}>
                {/* dot + connector */}
                <span
                  aria-hidden
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: "0 0 auto" }}
                >
                  <span
                    style={{
                      width: 9,
                      height: 9,
                      marginTop: 4,
                      borderRadius: "50%",
                      background: i === 0 ? "var(--green)" : "var(--surface)",
                      border: `1px solid ${i === 0 ? "var(--green-line)" : "var(--border-strong)"}`,
                    }}
                  />
                  {!last ? <span style={{ flex: "1 1 auto", width: 1, background: "var(--border)" }} /> : null}
                </span>
                <span style={{ display: "flex", flexDirection: "column", gap: 1, paddingBottom: last ? 0 : 14 }}>
                  <span style={{ fontSize: 13, color: "var(--fg)" }}>{x.label}</span>
                  {/*
                    `now` is null until the client clock is read after mount --
                    the store withholds it so a server-rendered "2 hours ago"
                    cannot disagree with the browser on hydration. The exact
                    stamp below renders either way, so nothing is missing.
                  */}
                  {now != null ? (
                    <span style={{ fontSize: 12, color: "var(--fg2)" }}>{relDT(x.at, now)}</span>
                  ) : null}
                  <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--fg3)" }}>{absDT(x.at)}</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

/** The run's own numbers, which are metadata rather than a point in time. */
export function GenerationCard({
  post,
  modelLabel,
  rows,
}: {
  post: Post;
  modelLabel: string | null;
  rows: { label: string; value: string }[];
}) {
  return (
    <div style={CARD}>
      <CardTitle>Generation</CardTitle>
      <dl style={{ margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        {[{ label: "Model", value: modelLabel ?? "Not recorded" }, ...rows].map((r) => (
          <div key={r.label} style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <dt style={{ fontSize: 12, color: "var(--fg2)" }}>{r.label}</dt>
            <span style={{ flex: "1 1 auto", borderBottom: "1px dotted var(--border)" }} />
            <dd style={{ margin: 0, fontFamily: MONO, fontSize: 12, color: "var(--fg)" }}>{r.value}</dd>
          </div>
        ))}
      </dl>
      {post.generationRunId ? (
        <p style={{ margin: "10px 0 0", fontFamily: MONO, fontSize: 10, color: "var(--fg3)", wordBreak: "break-all" }}>
          run {post.generationRunId}
        </p>
      ) : null}
    </div>
  );
}
