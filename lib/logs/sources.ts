/**
 * What the log viewer is allowed to read.
 *
 * The client sends a key from this list and nothing else. It never sends a
 * container name or a file path: `docker logs <name>` with a
 * caller-supplied name is arbitrary container access, and a caller-supplied
 * path is arbitrary file read. The mapping lives here so there is one place to
 * audit.
 */

export type LogSourceKey = "worker" | "temporal" | "litellm" | "postgres";

export type LogSource =
  | { key: LogSourceKey; label: string; kind: "file"; path: string; hint: string }
  | { key: LogSourceKey; label: string; kind: "container"; container: string; hint: string };

/**
 * Container names are the `container_name` values in docker-compose.yaml.
 *
 * Hardcoded rather than discovered through compose labels: a lookup would
 * survive a rename, but it would also mean shelling out to `docker ps` on
 * every connection to decide what is readable. A fixed list is the smaller
 * attack surface, at the cost of needing an edit if compose is renamed.
 */
export const LOG_SOURCES: Record<LogSourceKey, LogSource> = {
  worker: {
    key: "worker",
    label: "Worker",
    kind: "file",
    // Written by scripts/run-worker.mjs, which tees the worker's own output.
    path: "logs/worker.log",
    hint: "Generation runs: planning, image calls, uploads, failures.",
  },
  litellm: {
    key: "litellm",
    label: "LiteLLM",
    kind: "container",
    container: "insta-crossel-litellm",
    hint: "Model calls and provider errors.",
  },
  temporal: {
    key: "temporal",
    label: "Temporal",
    kind: "container",
    container: "insta-crossel-temporal",
    hint: "Workflow scheduling and task queues.",
  },
  postgres: {
    key: "postgres",
    label: "Postgres",
    kind: "container",
    container: "insta-crossel-postgres",
    hint: "Database errors and slow statements.",
  },
};

export const LOG_SOURCE_KEYS = Object.keys(LOG_SOURCES) as LogSourceKey[];

/**
 * Resolves a caller-supplied string to a source, or null.
 *
 * `Object.hasOwn` rather than a truthiness check on the lookup, so inherited
 * properties like `constructor` cannot name a source.
 */
export function resolveLogSource(raw: unknown): LogSource | null {
  if (typeof raw !== "string") return null;
  if (!Object.hasOwn(LOG_SOURCES, raw)) return null;
  return LOG_SOURCES[raw as LogSourceKey];
}

/** Lines of history to send before switching to live output. */
export const DEFAULT_TAIL = 200;
export const MAX_TAIL = 2000;

export function clampTail(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_TAIL;
  return Math.min(Math.max(Math.trunc(n), 1), MAX_TAIL);
}

/**
 * Whether log streaming is available at all.
 *
 * Off in production unless explicitly enabled. The stream carries raw
 * container output, which includes request bodies, connection strings and
 * anything else a service decided to print — see `redactSecrets`, which
 * reduces that risk but cannot eliminate it.
 */
export function logStreamEnabled(): boolean {
  if (process.env.ENABLE_LOG_STREAM === "true") return true;
  return process.env.NODE_ENV !== "production";
}
