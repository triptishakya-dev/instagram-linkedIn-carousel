import { now } from "./app-data";
import type { FailureClass, Platform, PostStatus, TargetStatus } from "./types";

/* ---------------------------------------------------------------- dates --
 * Every formatter takes an explicit time zone. The README is emphatic that
 * the server's own zone is never read, and a fixed zone also keeps server
 * and client markup identical.
 */

const dateTime = (tz: string) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: tz,
  });

const timeOnly = (tz: string) =>
  new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: tz,
  });

const dayOnly = (tz: string) =>
  new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: tz,
  });

export function fmtDateTime(iso: string, tz: string) {
  return dateTime(tz).format(new Date(iso)).replace(",", " ·");
}

export function fmtTime(iso: string, tz: string) {
  return timeOnly(tz).format(new Date(iso));
}

export function fmtDay(iso: string, tz: string) {
  return dayOnly(tz).format(new Date(iso));
}

/** `YYYY-MM-DD` as it falls in the given zone — the key the calendar buckets on. */
export function dayKey(iso: string, tz: string) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: tz,
  }).format(new Date(iso));
}

/** Relative to the current instant. */
export function fmtRelative(iso: string) {
  const delta = new Date(iso).getTime() - new Date(now()).getTime();
  const abs = Math.abs(delta);
  const mins = Math.round(abs / 60000);
  const hours = Math.round(abs / 3600000);
  const days = Math.round(abs / 86400000);

  let span: string;
  if (mins < 1) span = "just now";
  else if (mins < 60) span = `${mins}m`;
  else if (hours < 24) span = `${hours}h`;
  else span = `${days}d`;

  if (span === "just now") return span;
  return delta > 0 ? `in ${span}` : `${span} ago`;
}

export function daysUntil(iso: string) {
  return Math.round((new Date(iso).getTime() - new Date(now()).getTime()) / 86400000);
}

export function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/* --------------------------------------------------------------- tokens -- */

export type Tone = "ok" | "warn" | "danger" | "review" | "run" | "idle";

export const toneClass: Record<Tone, string> = {
  ok: "bg-ok-soft text-ok border-ok/25",
  warn: "bg-warn-soft text-warn border-warn/25",
  danger: "bg-danger-soft text-danger border-danger/25",
  review: "bg-review-soft text-review border-review/25",
  run: "bg-accent-soft text-accent border-accent/25",
  idle: "bg-idle-soft text-idle border-line",
};

/* Tailwind cannot build class names from interpolated strings, so every
 * tone-driven class is spelled out here rather than assembled at the call site. */
export const toneText: Record<Tone, string> = {
  ok: "text-ok",
  warn: "text-warn",
  danger: "text-danger",
  review: "text-review",
  run: "text-accent",
  idle: "text-idle",
};

export const toneBorder: Record<Tone, string> = {
  ok: "border-ok",
  warn: "border-warn",
  danger: "border-danger",
  review: "border-review",
  run: "border-accent",
  idle: "border-line-strong",
};

export const tonePanel: Record<Tone, string> = {
  ok: "border-ok/25 bg-ok-soft/50",
  warn: "border-warn/25 bg-warn-soft/50",
  danger: "border-danger/25 bg-danger-soft/50",
  review: "border-review/25 bg-review-soft/50",
  run: "border-accent/25 bg-accent-soft/50",
  idle: "border-line bg-surface-2",
};

export const toneDot: Record<Tone, string> = {
  ok: "bg-ok",
  warn: "bg-warn",
  danger: "bg-danger",
  review: "bg-review",
  run: "bg-accent",
  idle: "bg-idle",
};

/* --------------------------------------------------------------- status -- */

export const targetStatusTone: Record<TargetStatus, Tone> = {
  PENDING: "idle",
  PREPARING: "run",
  READY: "run",
  PUBLISHING: "warn",
  VERIFYING: "warn",
  PUBLISHED: "ok",
  FAILED: "danger",
  NEEDS_REVIEW: "review",
  SKIPPED: "idle",
};

export const postStatusTone: Record<PostStatus, Tone> = {
  DRAFT: "idle",
  SCHEDULED: "idle",
  PROCESSING: "run",
  PUBLISHED: "ok",
  PARTIALLY_PUBLISHED: "warn",
  FAILED: "danger",
  CANCELLED: "idle",
};

export const failureTone: Record<FailureClass, Tone> = {
  TRANSIENT: "warn",
  RATE_LIMIT: "warn",
  AUTH: "danger",
  PERMISSION: "danger",
  MEDIA: "danger",
  AMBIGUOUS: "review",
  PERMANENT: "danger",
};

/** Whether the publisher will try this class again on a later tick. */
export const failureRetries: Record<FailureClass, string> = {
  TRANSIENT: "Retried with backoff, capped at 15m",
  RATE_LIMIT: "Flat wait — never exponential from now",
  AUTH: "Not retried — account flagged, reconnect required",
  PERMISSION: "Not retried — needs a role change or review",
  MEDIA: "Not retried — the media itself must change",
  AMBIGUOUS: "Never retried — routed to NEEDS_REVIEW",
  PERMANENT: "Not retried",
};

export const TARGET_FLOW: TargetStatus[] = [
  "PENDING",
  "PREPARING",
  "READY",
  "PUBLISHING",
  "VERIFYING",
  "PUBLISHED",
];

export const TERMINAL_OFF_FLOW: TargetStatus[] = ["FAILED", "NEEDS_REVIEW", "SKIPPED"];

export function humanStatus(s: string) {
  return s.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());
}

/* ------------------------------------------------------------- platform -- */

export const platformLabel: Record<Platform, string> = {
  INSTAGRAM: "Instagram",
  LINKEDIN: "LinkedIn",
};

export const platformAccent: Record<Platform, string> = {
  INSTAGRAM: "text-ig",
  LINKEDIN: "text-li",
};

export const platformChip: Record<Platform, string> = {
  INSTAGRAM: "bg-ig-soft text-ig border-ig/25",
  LINKEDIN: "bg-li-soft text-li border-li/25",
};

/** What the platform actually renders for N images. */
export function mediaShape(platform: Platform, count: number) {
  if (platform === "INSTAGRAM") {
    if (count === 0) return "No post — Instagram requires at least one image";
    if (count === 1) return "Single image";
    return `Swipeable carousel · ${count} items`;
  }
  if (count === 0) return "Text-only post";
  if (count === 1) return "Single image";
  return `MultiImage grid · ${count} images`;
}
