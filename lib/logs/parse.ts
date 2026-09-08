/**
 * Normalises a log line into a timestamp, a level and a message.
 *
 * Four formats reach the viewer, and they agree on nothing:
 *
 *   - the worker wrapper's own `[ISO] [LEVEL] message`
 *   - Docker's RFC3339 prefix, from `docker logs --timestamps`
 *   - Temporal's JSON lines, `{"level":"info","ts":"…","msg":"…"}`
 *   - plain text, from anything that just called `console.log`
 *
 * A level is inferred from the text when the format carries none, because
 * filtering by level is the main reason to look at this page at all.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export type ParsedLine = {
  /** ISO string when the line carried one, else null. */
  ts: string | null;
  level: LogLevel;
  message: string;
};

const LEVEL_ALIASES: Record<string, LogLevel> = {
  trace: "debug",
  debug: "debug",
  dbg: "debug",
  info: "info",
  information: "info",
  notice: "info",
  log: "info",
  warn: "warn",
  warning: "warn",
  error: "error",
  err: "error",
  fatal: "error",
  critical: "error",
  panic: "error",
};

function normaliseLevel(raw: string | undefined | null): LogLevel | null {
  if (!raw) return null;
  return LEVEL_ALIASES[raw.trim().toLowerCase()] ?? null;
}

/**
 * Last resort when the format declares no level.
 *
 * Deliberately narrow. Matching the bare word "error" anywhere would paint
 * half a Postgres log red, so this looks for shapes that actually indicate a
 * failure — a level-ish prefix, or the words that accompany a stack trace.
 */
export function inferLevel(message: string): LogLevel {
  const head = message.slice(0, 200);
  if (/\b(error|exception|fatal|panic|unhandled|failed to|EADDRINUSE|ECONNREFUSED)\b/i.test(head)) {
    return "error";
  }
  // `Warning` also matches as a suffix, because that is how Node prints them:
  // "DeprecationWarning", "ExperimentalWarning". A leading \b would miss every
  // one. Plural "warnings" still does not match, so "0 errors, 0 warnings"
  // stays informational.
  if (/\bwarn(?:ing)?\b|Warning\b|\bdeprecat(?:ed|ion)\b|\bretrying\b/i.test(head)) {
    return "warn";
  }
  if (/\b(debug|verbose)\b/i.test(head)) return "debug";
  return "info";
}

/** A valid ISO timestamp, or null. Docker pads to nanoseconds, which Date rejects. */
function toIso(raw: string): string | null {
  // Trim sub-millisecond precision: 2026-09-07T09:28:57.954000000Z -> .954Z
  const trimmed = raw.replace(/(\.\d{3})\d+(?=Z|[+-]\d{2}:?\d{2}|$)/, "$1");
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

const WRAPPER_RE = /^\[([^\]]+)\]\s*\[([A-Za-z]+)\]\s*([\s\S]*)$/;
const DOCKER_TS_RE = /^(\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:?\d{2}))\s+([\s\S]*)$/;

export function parseLogLine(raw: string): ParsedLine {
  const line = raw.replace(/\r$/, "");

  // Docker's timestamp prefix wraps whatever the container printed, so it is
  // stripped first and the remainder re-parsed.
  const docker = DOCKER_TS_RE.exec(line);
  if (docker) {
    const inner = parseLogLine(docker[2]);
    return { ...inner, ts: inner.ts ?? toIso(docker[1]) };
  }

  // Temporal and other structured loggers.
  if (line.startsWith("{") && line.includes('"level"')) {
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      const message =
        typeof parsed.msg === "string"
          ? parsed.msg
          : typeof parsed.message === "string"
            ? parsed.message
            : line;
      const ts = typeof parsed.ts === "string" ? toIso(parsed.ts) : null;
      return {
        ts,
        level: normaliseLevel(typeof parsed.level === "string" ? parsed.level : null) ?? inferLevel(message),
        message,
      };
    } catch {
      // Truncated or interleaved JSON; fall through to the plain path.
    }
  }

  const wrapper = WRAPPER_RE.exec(line);
  if (wrapper) {
    const level = normaliseLevel(wrapper[2]);
    if (level) return { ts: toIso(wrapper[1]), level, message: wrapper[3] };
  }

  return { ts: null, level: inferLevel(line), message: line };
}

/**
 * Splits a chunk into whole lines, returning any trailing partial separately.
 *
 * A stream chunk boundary lands mid-line often enough that ignoring it visibly
 * corrupts output; the caller carries the remainder into the next chunk.
 */
export function splitLines(chunk: string): { lines: string[]; rest: string } {
  const parts = chunk.split("\n");
  const rest = parts.pop() ?? "";
  return { lines: parts, rest };
}
