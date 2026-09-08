"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MONO, absDT } from "@/lib/reds/format";
import { parseLogLine, type LogLevel } from "@/lib/logs/parse";
import { LOG_SOURCES, LOG_SOURCE_KEYS, type LogSourceKey } from "@/lib/logs/sources";
import { EmptyState } from "../charts";
import { seg, useReds } from "../store";

/**
 * How many lines are kept in memory.
 *
 * A chatty container emits faster than anyone reads, and an unbounded array
 * behind a nice UI is still a memory leak. Older lines fall off the top.
 */
const BUFFER_LIMIT = 2000;

type Entry = {
  id: number;
  ts: string | null;
  level: LogLevel;
  message: string;
};

type Status = "idle" | "connecting" | "live" | "ended" | "error";

const LEVELS: { k: LogLevel; label: string }[] = [
  { k: "debug", label: "Debug" },
  { k: "info", label: "Info" },
  { k: "warn", label: "Warn" },
  { k: "error", label: "Error" },
];

const LEVEL_COLOR: Record<LogLevel, string> = {
  debug: "var(--fg3)",
  info: "var(--fg2)",
  warn: "var(--amber)",
  error: "var(--red)",
};

const STATUS_DOT: Record<Status, { bg: string; label: string }> = {
  idle: { bg: "var(--n300)", label: "idle" },
  connecting: { bg: "var(--amber)", label: "connecting" },
  live: { bg: "var(--green)", label: "live" },
  ended: { bg: "var(--n300)", label: "ended" },
  error: { bg: "var(--red)", label: "unavailable" },
};

export function Logs() {
  const s = useReds();
  const [source, setSource] = useState<LogSourceKey>("worker");
  const [status, setStatus] = useState<Status>("connecting");
  const [notice, setNotice] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [paused, setPaused] = useState(false);
  const [follow, setFollow] = useState(true);
  const [levels, setLevels] = useState<LogLevel[]>([]);
  const [query, setQuery] = useState("");

  /**
   * The buffer as it looked when the user paused.
   *
   * Pausing freezes the view rather than dropping lines: ingest continues, so
   * resuming shows everything that arrived meanwhile instead of a gap. It also
   * means the stream handler needs no access to `paused`, which is what a ref
   * synced during render was previously for.
   */
  const [frozen, setFrozen] = useState<Entry[] | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const seqRef = useRef(0);

  /* ------------------------------------------------------------- stream -- */

  /**
   * Switching source clears the view here rather than in the effect below.
   *
   * The effect's job is to subscribe; resetting state in its body would make
   * every connection a second render pass, and the lint rule that catches it
   * is right — this is the event that changed, so this is where the reset
   * belongs.
   */
  const selectSource = (next: LogSourceKey) => {
    if (next === source) return;
    setEntries([]);
    setFrozen(null);
    setPaused(false);
    setNotice(null);
    setStatus("connecting");
    seqRef.current = 0;
    setSource(next);
  };

  useEffect(() => {
    const es = new EventSource(`/api/logs/stream?source=${source}&tail=300`);

    es.addEventListener("open", () => setStatus("live"));

    es.addEventListener("lines", (event) => {
      const { lines } = JSON.parse((event as MessageEvent).data) as { lines: string[] };
      setEntries((current) => {
        const next = current.slice();
        for (const raw of lines) {
          const parsed = parseLogLine(raw);
          next.push({ id: seqRef.current++, ...parsed });
        }
        return next.length > BUFFER_LIMIT ? next.slice(next.length - BUFFER_LIMIT) : next;
      });
    });

    es.addEventListener("info", (event) => {
      setNotice((JSON.parse((event as MessageEvent).data) as { message: string }).message);
    });

    es.addEventListener("ended", (event) => {
      setNotice((JSON.parse((event as MessageEvent).data) as { message: string }).message);
      setStatus("ended");
      es.close();
    });

    es.addEventListener("fatal", (event) => {
      setNotice((JSON.parse((event as MessageEvent).data) as { message: string }).message);
      setStatus("error");
      es.close();
    });

    // `EventSource` reconnects on its own, so a transient blip is not worth
    // reporting; only a close that follows a server-sent terminal event is.
    es.onerror = () => {
      setStatus((current) => (current === "live" ? "connecting" : current));
    };

    return () => es.close();
  }, [source]);

  /* ------------------------------------------------------------ display -- */

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (frozen ?? entries).filter((e) => {
      if (levels.length && !levels.includes(e.level)) return false;
      if (needle && !e.message.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [frozen, entries, levels, query]);

  const counts = useMemo(() => {
    const out: Record<LogLevel, number> = { debug: 0, info: 0, warn: 0, error: 0 };
    for (const e of entries) out[e.level] += 1;
    return out;
  }, [entries]);

  // Only autoscroll while following, so reading back through history is not
  // yanked to the bottom by every new line.
  useEffect(() => {
    if (!follow || paused) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [shown, follow, paused]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setFollow(atBottom);
  }, []);

  const copyAll = () => {
    const text = shown
      .map((e) => `${e.ts ? new Date(e.ts).toISOString() : ""} [${e.level}] ${e.message}`)
      .join("\n");
    navigator.clipboard
      ?.writeText(text)
      .then(() => s.toast(`${shown.length} lines copied`))
      .catch(() => s.toast("Could not copy to the clipboard"));
  };

  const dot = STATUS_DOT[status];
  const meta = LOG_SOURCES[source];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* ---- sources ---- */}
      <div role="tablist" aria-label="Log sources" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {LOG_SOURCE_KEYS.map((k) => {
          const on = source === k;
          return (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => selectSource(k)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                padding: "6px 12px",
                border: `1px solid ${on ? "var(--green-line)" : "var(--border)"}`,
                borderRadius: "var(--r3)",
                background: on ? "var(--green-tint)" : "var(--surface)",
                color: on ? "var(--green-text)" : "var(--fg2)",
                fontSize: 13,
                fontWeight: on ? 600 : 400,
                cursor: "pointer",
              }}
            >
              {on ? (
                <span aria-hidden style={{ width: 7, height: 7, borderRadius: "50%", background: dot.bg }} />
              ) : null}
              {LOG_SOURCES[k].label}
            </button>
          );
        })}
        <span style={{ flex: "1 1 auto" }} />
        <span style={{ alignSelf: "center", fontSize: 12, color: "var(--fg3)" }}>
          {dot.label} · {entries.length}
          {entries.length >= BUFFER_LIMIT ? "+" : ""} lines held
        </span>
      </div>

      <p style={{ margin: 0, fontSize: 12, color: "var(--fg2)" }}>{meta.hint}</p>

      {/* ---- controls ---- */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
        <div role="group" aria-label="Filter by level" style={{ display: "flex", gap: 2, padding: 2, border: "1px solid var(--border)", borderRadius: "var(--r3)", background: "var(--surface2)" }}>
          {LEVELS.map((l) => {
            const on = levels.includes(l.k);
            const c = seg(on);
            return (
              <button
                key={l.k}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setLevels((cur) => (cur.includes(l.k) ? cur.filter((x) => x !== l.k) : [...cur, l.k]))
                }
                style={{ border: 0, borderRadius: "var(--r2)", padding: "4px 9px", fontSize: 12, background: c.bg, color: on ? LEVEL_COLOR[l.k] : c.fg, cursor: "pointer" }}
              >
                {l.label} {counts[l.k] > 0 ? counts[l.k] : ""}
              </button>
            );
          })}
        </div>

        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter lines"
          aria-label="Filter lines"
          style={{ flex: "0 1 240px", padding: "6px 9px", border: "1px solid var(--border)", borderRadius: "var(--r3)", background: "var(--surface2)", fontSize: 12, color: "var(--fg)" }}
        />

        <button
          type="button"
          onClick={() => {
            if (paused) {
              setFrozen(null);
              setPaused(false);
            } else {
              setFrozen(entries);
              setPaused(true);
            }
          }}
          aria-pressed={paused}
          style={{ padding: "6px 11px", border: `1px solid ${paused ? "var(--amber-br)" : "var(--border)"}`, borderRadius: "var(--r3)", background: paused ? "var(--amber-bg)" : "var(--surface)", color: paused ? "var(--amber)" : "var(--fg2)", fontSize: 12, cursor: "pointer" }}
        >
          {paused ? "Paused" : "Pause"}
        </button>

        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--fg2)" }}>
          <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} style={{ accentColor: "var(--green-line)" }} />
          Follow
        </label>

        <span style={{ flex: "1 1 auto" }} />

        <button type="button" onClick={copyAll} style={{ padding: "6px 11px", border: "1px solid var(--border)", borderRadius: "var(--r3)", background: "var(--surface)", color: "var(--fg2)", fontSize: 12, cursor: "pointer" }}>
          Copy
        </button>
        <button type="button" onClick={() => { setEntries([]); setFrozen(null); }} style={{ padding: "6px 11px", border: "1px solid var(--border)", borderRadius: "var(--r3)", background: "var(--surface)", color: "var(--fg2)", fontSize: 12, cursor: "pointer" }}>
          Clear
        </button>
      </div>

      {notice ? (
        <p
          role="status"
          style={{ margin: 0, padding: "8px 11px", border: `1px solid ${status === "error" ? "var(--red-br)" : "var(--border)"}`, borderRadius: "var(--r3)", background: "var(--surface2)", fontSize: 12, color: status === "error" ? "var(--red)" : "var(--fg2)" }}
        >
          {notice}
        </p>
      ) : null}

      {/* ---- output ---- */}
      {entries.length === 0 && status !== "connecting" ? (
        <EmptyState
          title="No output yet"
          body={`Nothing has been written to ${meta.label} since this page connected. Trigger a run, or pick another source.`}
        />
      ) : (
        <div
          ref={scrollRef}
          onScroll={onScroll}
          aria-label={`${meta.label} log output`}
          style={{ height: "min(62vh, 620px)", overflowY: "auto", border: "1px solid var(--border)", borderRadius: "var(--r3)", background: "var(--sunken)", padding: "8px 0" }}
        >
          {shown.length === 0 ? (
            <p style={{ margin: 0, padding: "12px 14px", fontSize: 12, color: "var(--fg3)" }}>
              {entries.length} lines held, none match the current filter.
            </p>
          ) : (
            shown.map((e) => (
              <div
                key={e.id}
                style={{ display: "flex", gap: 10, padding: "1px 14px", fontFamily: MONO, fontSize: 12, lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word" }}
              >
                <span aria-hidden style={{ flex: "0 0 auto", color: "var(--fg3)", opacity: 0.75 }}>
                  {e.ts ? absDT(e.ts).split(", ").pop() : "—"}
                </span>
                <span style={{ flex: "1 1 auto", color: LEVEL_COLOR[e.level] }}>{e.message}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
