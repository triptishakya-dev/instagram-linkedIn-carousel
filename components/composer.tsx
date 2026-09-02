"use client";

import { useMemo, useRef, useState } from "react";
import { accounts, socialTargets } from "@/lib/mock-data";
import type { Platform, PostMedia } from "@/lib/types";
import { fmtBytes, mediaShape, platformChip } from "@/lib/format";
import { Card, CardHeader, Icon, MediaTile, Meter, Mono, PageHeader, Pill, PlatformMark } from "./ui";

/* Stand-ins for a real upload — a UI build has no storage behind it. */
const POOL: PostMedia[] = [
  { id: "u1", tint: "#d6296f", aspect: "4:5", fileName: "studio-01.jpg", bytes: 1_640_000, mime: "image/jpeg" },
  { id: "u2", tint: "#5b4bd6", aspect: "4:5", fileName: "studio-02.jpg", bytes: 1_510_000, mime: "image/jpeg" },
  { id: "u3", tint: "#0a9c8a", aspect: "1:1", fileName: "detail-03.jpg", bytes: 980_000, mime: "image/jpeg" },
  { id: "u4", tint: "#e08a2b", aspect: "1:1", fileName: "detail-04.png", bytes: 2_240_000, mime: "image/png" },
  { id: "u5", tint: "#2b8ae0", aspect: "1.91:1", fileName: "wide-05.jpg", bytes: 1_180_000, mime: "image/jpeg" },
  { id: "u6", tint: "#c0397a", aspect: "4:5", fileName: "studio-06.jpg", bytes: 1_390_000, mime: "image/jpeg" },
];

const IG_CAPTION_MAX = 2200;
const LI_COMMENTARY_MAX = 3000;
/** LinkedIn access expires 2026-09-11; scheduling is capped two days short of it. */
const SCHEDULE_CEILING = "2026-09-09";

type Severity = "block" | "warn" | "info";
type Check = { severity: Severity; text: string };

export function Composer() {
  const [media, setMedia] = useState<PostMedia[]>(POOL.slice(0, 3));
  const [caption, setCaption] = useState(
    "Six weeks of studio process in one post. The first frame sets the crop — everything after it follows.",
  );
  const [selected, setSelected] = useState<string[]>(["tgt_ig_main", "tgt_li_member"]);
  const [date, setDate] = useState("2026-09-01");
  const [time, setTime] = useState("09:30");
  const [tz, setTz] = useState("Asia/Kolkata");
  const [stale, setStale] = useState(30);
  const [preview, setPreview] = useState<Platform>("INSTAGRAM");

  const platforms = useMemo(
    () => [
      ...new Set(
        socialTargets.filter((t) => selected.includes(t.id)).map((t) => t.platform),
      ),
    ],
    [selected],
  );

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function addImage() {
    const next = POOL.find((p) => !media.some((m) => m.id === p.id));
    if (next) setMedia((m) => [...m, next]);
  }

  const checks = useMemo(
    () => runChecks({ media, caption, platforms, date }),
    [media, caption, platforms, date],
  );
  const blocking = checks.filter((c) => c.severity === "block");

  const cost = useMemo(() => estimateCost(platforms, media.length), [platforms, media.length]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Composer"
        title="New post"
        description="One caption, one set of images, and a separate preview per destination — because Instagram and LinkedIn do not render the same post the same way."
        action={
          <button
            type="button"
            disabled={blocking.length > 0}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Icon name="clock" className="h-4 w-4" />
            {blocking.length > 0 ? `${blocking.length} to fix` : "Schedule post"}
          </button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start">
        {/* ------------------------------------------------------------ edit */}
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Media"
              hint="JPEG converted on upload — Instagram rejects PNG and WEBP at container creation often enough to be worth normalising."
              action={
                <button
                  type="button"
                  onClick={addImage}
                  disabled={media.length >= POOL.length}
                  className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-fg transition-colors hover:bg-surface-3 disabled:opacity-40"
                >
                  Add image
                </button>
              }
            />
            <div className="p-5">
              {media.length === 0 ? (
                <div className="rounded-lg border border-dashed border-line-strong px-6 py-10 text-center">
                  <p className="text-xs text-subtle">
                    No media. LinkedIn will still take this as a text-only post; Instagram will not.
                  </p>
                </div>
              ) : (
                <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                  {media.map((m, i) => (
                    <li key={m.id} className="group relative">
                      <MediaTile media={m} index={i} />
                      <p className="mt-1 truncate font-mono text-[10px] text-subtle">
                        {m.aspect} · {fmtBytes(m.bytes)}
                      </p>
                      <div className="absolute inset-x-1 bottom-7 flex justify-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        {i !== 0 ? (
                          <button
                            type="button"
                            onClick={() =>
                              setMedia((list) => [m, ...list.filter((x) => x.id !== m.id)])
                            }
                            className="rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white"
                          >
                            make first
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => setMedia((list) => list.filter((x) => x.id !== m.id))}
                          className="rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white"
                        >
                          remove
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {media.length > 1 ? (
                <p className="mt-4 rounded-lg border border-line bg-surface-2 px-3 py-2 text-[11px] leading-relaxed text-muted">
                  <span className="font-medium text-fg">First image sets the crop.</span> Instagram
                  crops every carousel child to <Mono>{media[0].aspect}</Mono> — the ratio of image
                  1, not each image&apos;s own.
                </p>
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Caption"
              action={
                <span className="font-mono text-[11px] text-subtle">
                  {caption.length}/{platforms.includes("INSTAGRAM") ? IG_CAPTION_MAX : LI_COMMENTARY_MAX}
                </span>
              }
            />
            <div className="p-5">
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={5}
                className="w-full resize-y rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm leading-relaxed text-fg outline-none placeholder:text-subtle focus:border-accent/50"
                placeholder="Write once. Preview per target."
              />
              {caption.includes("@") ? (
                <p className="mt-2 text-[11px] leading-relaxed text-warn">
                  LinkedIn @mentions are not supported by the API. The text publishes literally —
                  no one gets tagged.
                </p>
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Destinations"
              hint="Each destination becomes its own PublishTarget. They succeed and fail independently."
            />
            <ul className="divide-y divide-line">
              {accounts.flatMap((a) =>
                a.targets.map((t) => {
                  const usable = t.connected;
                  const on = selected.includes(t.id);
                  return (
                    <li key={t.id} className="px-5 py-3.5">
                      <label
                        className={`flex items-start gap-3 ${usable ? "cursor-pointer" : "cursor-not-allowed"}`}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={!usable}
                          onChange={() => toggle(t.id)}
                          className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span
                              className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${platformChip[t.platform]}`}
                            >
                              <PlatformMark platform={t.platform} className="h-3 w-3" />
                              {t.handle}
                            </span>
                            <span className="text-xs text-fg">{t.displayName}</span>
                            {!usable ? <Pill tone="danger">Unavailable</Pill> : null}
                          </span>
                          {t.blockedReason ? (
                            <span className="mt-1 block text-[11px] leading-relaxed text-subtle">
                              {t.blockedReason}
                            </span>
                          ) : (
                            <span className="mt-1 block font-mono text-[10px] text-subtle">
                              {t.urn}
                            </span>
                          )}
                        </span>
                      </label>
                    </li>
                  );
                }),
              )}
            </ul>
          </Card>

          <Card>
            <CardHeader
              title="Schedule"
              hint="Stored in UTC with the zone kept separately — a fixed offset would drift across DST."
            />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Date">
                <input
                  type="date"
                  value={date}
                  max={SCHEDULE_CEILING}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-fg outline-none focus:border-accent/50"
                />
              </Field>
              <Field label="Time">
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-fg outline-none focus:border-accent/50"
                />
              </Field>
              <Field label="Time zone">
                <select
                  value={tz}
                  onChange={(e) => setTz(e.target.value)}
                  className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-fg outline-none focus:border-accent/50"
                >
                  {["Asia/Kolkata", "Europe/London", "America/New_York", "Australia/Sydney"].map(
                    (z) => (
                      <option key={z} value={z}>
                        {z}
                      </option>
                    ),
                  )}
                </select>
              </Field>
              <Field label={`Stale after — ${stale} min`}>
                <input
                  type="range"
                  min={5}
                  max={120}
                  step={5}
                  value={stale}
                  onChange={(e) => setStale(Number(e.target.value))}
                  className="w-full accent-[var(--accent)]"
                />
                <p className="mt-1 text-[11px] leading-relaxed text-subtle">
                  Cron can be late. Past this window the post fails instead of going out at the
                  wrong hour.
                </p>
              </Field>
            </div>
          </Card>
        </div>

        {/* --------------------------------------------------------- preview */}
        <div className="space-y-6 lg:sticky lg:top-6">
          <Card>
            <div className="flex gap-1 border-b border-line p-2">
              {(["INSTAGRAM", "LINKEDIN"] as Platform[]).map((p) => {
                const active = preview === p;
                const targeted = platforms.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPreview(p)}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                      active ? "bg-surface-3 text-fg" : "text-subtle hover:text-fg"
                    }`}
                  >
                    <PlatformMark platform={p} className="h-3.5 w-3.5" />
                    {p === "INSTAGRAM" ? "Instagram" : "LinkedIn"}
                    {!targeted ? <span className="text-[10px] opacity-60">off</span> : null}
                  </button>
                );
              })}
            </div>

            <div className="p-4">
              {preview === "INSTAGRAM" ? (
                <InstagramPreview media={media} caption={caption} />
              ) : (
                <LinkedInPreview media={media} caption={caption} />
              )}
              <p className="mt-3 text-center text-[11px] text-subtle">
                {mediaShape(preview, media.length)}
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader title="Pre-flight" hint="Checked now, at schedule time — not only at publish time." />
            <ul className="divide-y divide-line">
              {checks.map((c, i) => (
                <li key={i} className="flex gap-2.5 px-5 py-3">
                  <span className="mt-0.5 shrink-0">
                    {c.severity === "block" ? (
                      <Icon name="alert" className="h-3.5 w-3.5 text-danger" />
                    ) : c.severity === "warn" ? (
                      <Icon name="alert" className="h-3.5 w-3.5 text-warn" />
                    ) : (
                      <Icon name="check" className="h-3.5 w-3.5 text-ok" />
                    )}
                  </span>
                  <p className="text-[11px] leading-relaxed text-muted">{c.text}</p>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Budget cost of this post" />
            <div className="space-y-4 p-5">
              {accounts
                .filter((a) => platforms.includes(a.platform))
                .map((a) => {
                  const spend = a.platform === "INSTAGRAM" ? cost.instagram : cost.linkedin;
                  const after = a.quota.used + spend;
                  const over = after > a.quota.limit;
                  return (
                    <div key={a.id}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-medium text-fg">{a.quota.label}</span>
                        <span
                          className={`font-mono text-[11px] ${over ? "text-danger" : "text-muted"}`}
                        >
                          {a.quota.used} + {spend} / {a.quota.limit}
                        </span>
                      </div>
                      <div className="mt-2">
                        <Meter
                          value={Math.min(after, a.quota.limit)}
                          max={a.quota.limit}
                          tone={over ? "danger" : after / a.quota.limit > 0.8 ? "warn" : "run"}
                        />
                      </div>
                      <p className="mt-1.5 text-[10px] leading-relaxed text-subtle">
                        {a.platform === "INSTAGRAM"
                          ? "1 against the publishing cap, but container creation and polling burn the hourly call budget."
                          : "2 calls per image (initializeUpload + PUT) plus the create."}
                      </p>
                    </div>
                  );
                })}
              {platforms.length === 0 ? (
                <p className="text-[11px] text-subtle">Pick a destination to see its cost.</p>
              ) : null}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- parts -- */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

function InstagramPreview({ media, caption }: { media: PostMedia[]; caption: string }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const crop = media[0]?.aspect ?? "1:1";

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="h-7 w-7 rounded-full bg-ig" />
        <span className="text-xs font-semibold text-fg">rubenius.studio</span>
      </div>

      {media.length === 0 ? (
        <div className="grid aspect-square place-items-center border-y border-line bg-surface-2 px-6 text-center">
          <p className="text-[11px] leading-relaxed text-danger">
            Instagram has no text-only post. This target cannot publish.
          </p>
        </div>
      ) : (
        <>
          <div
            ref={scroller}
            onScroll={(e) => {
              const el = e.currentTarget;
              setIndex(Math.round(el.scrollLeft / el.clientWidth));
            }}
            className="snapx flex overflow-x-auto border-y border-line"
          >
            {media.map((m) => (
              <div key={m.id} className="w-full shrink-0">
                <MediaTile media={m} forcedAspect={crop} className="rounded-none border-0" />
              </div>
            ))}
          </div>
          {media.length > 1 ? (
            <div className="flex justify-center gap-1.5 py-2">
              {media.map((m, i) => (
                <span
                  key={m.id}
                  className={`h-1.5 w-1.5 rounded-full ${i === index ? "bg-accent" : "bg-line-strong"}`}
                />
              ))}
            </div>
          ) : null}
        </>
      )}

      <p className="px-3 py-3 text-xs leading-relaxed text-fg">
        <span className="font-semibold">rubenius.studio</span>{" "}
        <span className="text-muted">{caption}</span>
      </p>
    </div>
  );
}

function LinkedInPreview({ media, caption }: { media: PostMedia[]; caption: string }) {
  const shown = media.slice(0, 4);
  const extra = media.length - shown.length;

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="h-9 w-9 rounded-full bg-li" />
        <span className="leading-tight">
          <span className="block text-xs font-semibold text-fg">Ansuman Dash</span>
          <span className="block text-[10px] text-subtle">Now · Public</span>
        </span>
      </div>

      <p className="px-3 pb-3 text-xs leading-relaxed text-fg">{caption}</p>

      {media.length === 0 ? null : media.length === 1 ? (
        <MediaTile media={media[0]} className="rounded-none border-x-0" />
      ) : (
        <div
          className={`grid gap-0.5 border-y border-line ${shown.length === 2 ? "grid-cols-2" : "grid-cols-2"}`}
        >
          {shown.map((m, i) => (
            <div key={m.id} className="relative">
              <MediaTile media={m} forcedAspect="1:1" className="rounded-none border-0" />
              {i === shown.length - 1 && extra > 0 ? (
                <span className="absolute inset-0 grid place-items-center bg-black/55 text-sm font-semibold text-white">
                  +{extra}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <p className="px-3 py-2.5 text-[10px] text-subtle">
        Grid, not a carousel. Nothing swipes — the organic swipeable format is sponsored-only.
      </p>
    </div>
  );
}

/* ----------------------------------------------------------------- rules -- */

function runChecks({
  media,
  caption,
  platforms,
  date,
}: {
  media: PostMedia[];
  caption: string;
  platforms: Platform[];
  date: string;
}): Check[] {
  const out: Check[] = [];

  if (platforms.length === 0) {
    out.push({ severity: "block", text: "Pick at least one destination." });
  }

  if (platforms.includes("INSTAGRAM")) {
    if (media.length === 0) {
      out.push({
        severity: "block",
        text: "Instagram requires at least one image. Validation is per target, not global — LinkedIn would still accept this.",
      });
    }
    if (media.length > 10) {
      out.push({ severity: "block", text: "Instagram carousels take 2–10 items. This has more." });
    }
    const mixed = media.length > 1 && media.some((m) => m.aspect !== media[0].aspect);
    if (mixed) {
      out.push({
        severity: "warn",
        text: `Mixed ratios. Every child is cropped to ${media[0].aspect} because image 1 is ${media[0].aspect}.`,
      });
    }
    const nonJpeg = media.filter((m) => m.mime !== "image/jpeg");
    if (nonJpeg.length > 0) {
      out.push({
        severity: "warn",
        text: `${nonJpeg.length} file is not JPEG (${nonJpeg.map((m) => m.fileName).join(", ")}). Converted on upload — PNG and WEBP get rejected at container creation often enough to justify it.`,
      });
    }
    if (caption.length > IG_CAPTION_MAX) {
      out.push({ severity: "block", text: `Caption is over Instagram's ${IG_CAPTION_MAX} characters.` });
    }
  }

  if (platforms.includes("LINKEDIN")) {
    if (media.length > 20) {
      out.push({ severity: "block", text: "LinkedIn MultiImage takes 2–20 images." });
    }
    if (media.length === 0) {
      out.push({ severity: "info", text: "LinkedIn text-only post — allowed here, unlike Instagram." });
    }
    if (caption.length > LI_COMMENTARY_MAX) {
      out.push({ severity: "block", text: `Commentary is over LinkedIn's ${LI_COMMENTARY_MAX} characters.` });
    }
    out.push({
      severity: "info",
      text: "Member scope is write-only. If the create call times out we cannot read the post back, so it goes to Needs review instead of being retried.",
    });
  }

  if (date > SCHEDULE_CEILING) {
    out.push({
      severity: "block",
      text: `Cannot schedule past ${SCHEDULE_CEILING} — that is the LinkedIn token expiry minus a two-day buffer. Reconnect to schedule further out.`,
    });
  } else {
    out.push({
      severity: "info",
      text: `Within the LinkedIn token window. Scheduling is capped at ${SCHEDULE_CEILING}.`,
    });
  }

  return out;
}

function estimateCost(platforms: Platform[], n: number) {
  // IG: one container per image, roughly two status polls each, plus parent + publish + limit check
  const instagram = platforms.includes("INSTAGRAM") && n > 0 ? n * 3 + (n > 1 ? 2 : 1) + 1 : 0;
  // LI: initializeUpload + PUT per image, plus the create
  const linkedin = platforms.includes("LINKEDIN") ? n * 2 + 1 : 0;
  return { instagram, linkedin };
}
