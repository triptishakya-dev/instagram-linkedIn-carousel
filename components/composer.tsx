"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { scheduleCeiling, USER_TZ } from "@/lib/app-data";
import type { Platform } from "@/lib/types";
import { fmtBytes } from "@/lib/format";
import { ALLOWED_IMAGE_MIME } from "@/lib/media";
import { ApiClientError, createPost, uploadImage } from "@/lib/api-client";
import { Card, CardHeader, Icon, PageHeader, PlatformMark } from "./ui";

const IG_CAPTION_MAX = 2200;
const LI_COMMENTARY_MAX = 3000;

type Severity = "block" | "warn" | "info";
type Check = { severity: Severity; text: string };

type LogoData = {
  /** Object URL for the local preview. */
  url: string;
  fileName: string;
  bytes: number;
  /** S3 key, once the upload finishes. Null while it is still in flight. */
  key: string | null;
};

type SubmitState = "idle" | "uploading" | "saving" | "done";

type Scheduled = {
  id: string;
  scheduledAt: string;
  unconnectedPlatforms: string[];
};

export function Composer() {
  const [logo, setLogo] = useState<LogoData | null>(null);
  const [captionPrompt, setCaptionPrompt] = useState("");
  const [caption, setCaption] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>(["INSTAGRAM", "LINKEDIN"]);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:30");
  const [tz, setTz] = useState(USER_TZ);
  const [stale, setStale] = useState(30);

  const [uploadError, setUploadError] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const [scheduled, setScheduled] = useState<Scheduled | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);
  /** Regenerated per submit attempt, so a retry replays rather than duplicates. */
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());

  const ceiling = scheduleCeiling();

  const platforms = selectedPlatforms;

  function togglePlatform(platform: Platform) {
    setSelectedPlatforms((prev) =>
      prev.includes(platform) ? prev.filter((p) => p !== platform) : [...prev, platform],
    );
  }

  const cancelUpload = useCallback(() => {
    uploadAbortRef.current?.abort();
    uploadAbortRef.current = null;
  }, []);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // A previous upload is now irrelevant; stop paying for it.
    cancelUpload();
    const controller = new AbortController();
    uploadAbortRef.current = controller;

    const previewUrl = URL.createObjectURL(file);
    setLogo({ url: previewUrl, fileName: file.name, bytes: file.size, key: null });
    setUploadError(null);
    setSubmitState("uploading");

    try {
      const { key } = await uploadImage(file, controller.signal);
      // Ignore a result that arrived after the user picked something else.
      if (uploadAbortRef.current !== controller) return;
      setLogo((prev) => (prev ? { ...prev, key } : prev));
    } catch (err) {
      if (controller.signal.aborted) return;
      setUploadError(
        err instanceof ApiClientError ? err.message : "Upload failed. Check your connection.",
      );
      setLogo(null);
      URL.revokeObjectURL(previewUrl);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } finally {
      if (uploadAbortRef.current === controller) {
        uploadAbortRef.current = null;
        setSubmitState("idle");
      }
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const removeLogo = () => {
    cancelUpload();
    if (logo) URL.revokeObjectURL(logo.url);
    setLogo(null);
    setUploadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const checks = useMemo(
    () => runChecks({ logo, captionPrompt, caption, platforms, date, ceiling }),
    [logo, captionPrompt, caption, platforms, date, ceiling],
  );
  const blocking = checks.filter((c) => c.severity === "block");

  const busy = submitState === "uploading" || submitState === "saving";
  const uploadPending = logo !== null && logo.key === null;
  const canSubmit = blocking.length === 0 && !busy && !uploadPending;

  function composeAnother() {
    if (logo) URL.revokeObjectURL(logo.url);
    setLogo(null);
    setCaption("");
    setCaptionPrompt("");
    setDate("");
    setScheduled(null);
    setSubmitState("idle");
    setSubmitError(null);
    setErrorField(null);
    idempotencyKeyRef.current = crypto.randomUUID();
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit() {
    if (!canSubmit) return;

    setSubmitState("saving");
    setSubmitError(null);
    setErrorField(null);

    try {
      const post = await createPost(
        {
          caption: caption.trim(),
          captionPrompt: captionPrompt.trim() || null,
          platforms,
          date,
          time,
          timezone: tz,
          staleAfterMinutes: stale,
          media: logo?.key ? [{ key: logo.key, order: 0 }] : [],
        },
        idempotencyKeyRef.current,
      );

      setSubmitState("done");
      setScheduled({
        id: post.id,
        scheduledAt: post.scheduledAt,
        unconnectedPlatforms: post.unconnectedPlatforms ?? [],
      });
    } catch (err) {
      if (err instanceof ApiClientError) {
        setSubmitError(err.message);
        setErrorField(err.field ?? null);
        // The server rejected this payload, so a retry of it is a new attempt.
        idempotencyKeyRef.current = crypto.randomUUID();
      } else {
        setSubmitError("Could not reach the server. Try again.");
      }
      setSubmitState("idle");
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader
        eyebrow="Composer"
        title="New post"
        description="One caption and your brand logo, scheduled out to Instagram and LinkedIn."
        action={
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Icon name="clock" className="h-4 w-4" />
            {submitState === "saving"
              ? "Scheduling…"
              : submitState === "uploading" || uploadPending
                ? "Uploading logo…"
                : blocking.length > 0
                  ? `${blocking.length} to fix`
                  : "Schedule post"}
          </button>
        }
      />

      {scheduled ? (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-lg border border-ok/30 bg-ok-soft px-4 py-3"
        >
          <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-ok">Scheduled</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
              Saved as <span className="font-mono text-fg">{scheduled.id}</span>, due{" "}
              {new Date(scheduled.scheduledAt).toLocaleString()}.
            </p>
            {scheduled.unconnectedPlatforms.length > 0 ? (
              <p className="mt-1 text-[11px] leading-relaxed text-warn">
                {scheduled.unconnectedPlatforms.join(" and ")}{" "}
                {scheduled.unconnectedPlatforms.length > 1 ? "have" : "has"} no connected account
                yet, so nothing will publish until you connect one.
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={composeAnother}
            className="shrink-0 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-fg transition-colors hover:bg-surface-3"
          >
            New post
          </button>
        </div>
      ) : null}

      {submitError ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-danger/30 bg-danger/[0.07] px-4 py-3"
        >
          <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-danger">Could not schedule this post</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
              {submitError}
              {errorField ? <span className="text-subtle"> ({errorField})</span> : null}
            </p>
          </div>
        </div>
      ) : null}

      {/* ------------------------------------------------------------ content */}
      <Card>
        <CardHeader title="Content" hint="The logo and the caption that go out with the post." />

        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_IMAGE_MIME.join(",")}
          onChange={handleLogoUpload}
          className="hidden"
        />

        <div className="grid gap-5 p-5 sm:grid-cols-[9.5rem_minmax(0,1fr)]">
          <div className="min-w-0 max-w-[9.5rem]">
            <FieldLabel
              label="Logo"
              hint={
                logo === null
                  ? "IG needs one"
                  : logo.key === null
                    ? "uploading…"
                    : fmtBytes(logo.bytes)
              }
            />
            {!logo ? (
              <button
                type="button"
                onClick={triggerFileInput}
                className="group flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-line-strong px-3 text-center transition-colors hover:border-accent hover:bg-surface-2/60"
              >
                <Icon
                  name="image"
                  className="h-6 w-6 text-subtle transition-colors group-hover:text-accent"
                />
                <span className="text-xs font-medium text-fg">Upload logo</span>
                <span className="text-[10px] leading-tight text-subtle">PNG · JPG · WEBP</span>
              </button>
            ) : (
              <div className="space-y-2">
                <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-line bg-surface-2 p-3">
                  <img
                    src={logo.url}
                    alt="Uploaded logo"
                    className={`max-h-full max-w-full object-contain transition-opacity ${
                      logo.key === null ? "opacity-40" : "opacity-100"
                    }`}
                  />
                  {logo.key === null ? (
                    <span className="absolute inset-x-0 bottom-0 bg-surface/90 py-1 text-center text-[10px] font-medium text-muted">
                      Uploading…
                    </span>
                  ) : null}
                </div>
                <p className="truncate text-[11px] font-medium text-fg" title={logo.fileName}>
                  {logo.fileName}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={triggerFileInput}
                    className="text-[11px] font-medium text-accent hover:underline"
                  >
                    Change
                  </button>
                  <span className="text-[11px] text-subtle">·</span>
                  <button
                    type="button"
                    onClick={removeLogo}
                    className="text-[11px] font-medium text-danger hover:underline"
                  >
                    Remove
                  </button>
                </div>
              </div>
            )}
            {uploadError ? (
              <p className="mt-2 text-[11px] leading-relaxed text-danger">{uploadError}</p>
            ) : null}
          </div>

          <Field label="Caption prompt" hint="optional">
            <textarea
              value={captionPrompt}
              onChange={(e) => setCaptionPrompt(e.target.value)}
              className="min-h-[9.5rem] w-full resize-y rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm leading-relaxed text-fg outline-none placeholder:text-subtle focus:border-accent/50"
              placeholder="Instructions used to generate the caption…"
            />
          </Field>
        </div>

        <div className="border-t border-line p-5">
          <Field
            label="Caption *"
            hint={`${caption.length}/${platforms.includes("INSTAGRAM") ? IG_CAPTION_MAX : LI_COMMENTARY_MAX}`}
          >
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              required
              rows={5}
              className="w-full resize-y rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm leading-relaxed text-fg outline-none placeholder:text-subtle focus:border-accent/50"
              placeholder="Write required caption…"
            />
          </Field>
          {!caption.trim() ? (
            <p className="mt-1.5 text-[11px] font-medium text-danger">
              Caption text field is required.
            </p>
          ) : null}
          {caption.includes("@") ? (
            <p className="mt-1.5 text-[11px] leading-relaxed text-warn">
              LinkedIn @mentions are not supported by the API. The text publishes literally — no
              one gets tagged.
            </p>
          ) : null}
        </div>
      </Card>

      {/* ------------------------------------------------------- destinations */}
      <Card>
        <CardHeader title="Destinations" hint="Each target is validated on its own rules." />
        <div className="grid gap-3 p-5 sm:grid-cols-2">
          {(["INSTAGRAM", "LINKEDIN"] as Platform[]).map((p) => {
            const on = selectedPlatforms.includes(p);
            return (
              <button
                key={p}
                type="button"
                role="switch"
                aria-checked={on}
                onClick={() => togglePlatform(p)}
                className={`flex items-center justify-between gap-3 rounded-lg border px-3.5 py-3 text-left transition-colors ${
                  on
                    ? "border-accent/40 bg-accent/[0.06]"
                    : "border-line bg-surface-2 hover:bg-surface-3"
                }`}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <PlatformMark platform={p} className="h-4 w-4 shrink-0" />
                  <span className="truncate text-sm font-medium text-fg">
                    {p === "INSTAGRAM" ? "Instagram" : "LinkedIn"}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                    on ? "bg-accent" : "bg-surface-3 ring-1 ring-inset ring-line-strong"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                      on ? "translate-x-[1.125rem]" : "translate-x-0.5"
                    }`}
                  />
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      {/* ----------------------------------------------------------- schedule */}
      <Card>
        <CardHeader
          title="Schedule"
          hint="Stored in UTC with the zone kept separately — a fixed offset would drift across DST."
        />
        <div className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Date *">
              <input
                type="date"
                value={date}
                max={ceiling ?? undefined}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-fg outline-none focus:border-accent/50"
              />
            </Field>
            <Field label="Time *">
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
          </div>

          <Field label="Stale after" hint={`${stale} min`}>
            <input
              type="range"
              min={5}
              max={120}
              step={5}
              value={stale}
              onChange={(e) => setStale(Number(e.target.value))}
              className="mt-1 w-full accent-[var(--accent)]"
            />
          </Field>
        </div>
      </Card>
    </div>
  );
}

/* ----------------------------------------------------------------- parts -- */

function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <span className="mb-1.5 flex items-baseline justify-between gap-2">
      <span className="text-[11px] font-medium text-muted">{label}</span>
      {hint ? <span className="font-mono text-[10px] text-subtle">{hint}</span> : null}
    </span>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <FieldLabel label={label} hint={hint} />
      {children}
    </label>
  );
}

/* ----------------------------------------------------------------- rules -- */

function runChecks({
  logo,
  captionPrompt,
  caption,
  platforms,
  date,
  ceiling,
}: {
  logo: LogoData | null;
  captionPrompt: string;
  caption: string;
  platforms: Platform[];
  date: string;
  ceiling: string | null;
}): Check[] {
  const out: Check[] = [];

  if (!caption.trim()) {
    out.push({ severity: "block", text: "Caption text field is required." });
  }

  if (platforms.length === 0) {
    out.push({ severity: "block", text: "Pick at least one destination." });
  }

  if (platforms.includes("INSTAGRAM")) {
    if (!logo) {
      out.push({
        severity: "block",
        text: "Instagram requires at least one logo image. Validation is per target, not global — LinkedIn would still accept this.",
      });
    }
    if (caption.length > IG_CAPTION_MAX) {
      out.push({ severity: "block", text: `Caption is over Instagram's ${IG_CAPTION_MAX} characters.` });
    }
  }

  if (platforms.includes("LINKEDIN")) {
    if (!logo) {
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

  if (!date) {
    out.push({ severity: "block", text: "Pick a date and time." });
  } else if (ceiling && date > ceiling) {
    out.push({
      severity: "block",
      text: `Cannot schedule past ${ceiling} — that is the earliest token expiry minus a two-day buffer. Reconnect to schedule further out.`,
    });
  } else if (ceiling) {
    out.push({
      severity: "info",
      text: `Within the token window. Scheduling is capped at ${ceiling}.`,
    });
  }

  return out;
}
