import { afterEach, describe, expect, it, vi } from "vitest";
import { inferLevel, parseLogLine, splitLines } from "@/lib/logs/parse";
import { REDACTION_MASK, redactSecrets } from "@/lib/logs/redact";
import { clampTail, logStreamEnabled, resolveLogSource } from "@/lib/logs/sources";

describe("parseLogLine — the worker wrapper's format", () => {
  it("reads timestamp, level and message", () => {
    const parsed = parseLogLine("[2026-09-04T06:40:20.284Z] [INFO] --- worker starting (pid 19880) ---");
    expect(parsed.ts).toBe("2026-09-04T06:40:20.284Z");
    expect(parsed.level).toBe("info");
    expect(parsed.message).toBe("--- worker starting (pid 19880) ---");
  });

  it("maps level aliases onto the four levels", () => {
    expect(parseLogLine("[2026-09-04T06:40:20.284Z] [WARNING] slow").level).toBe("warn");
    expect(parseLogLine("[2026-09-04T06:40:20.284Z] [FATAL] gone").level).toBe("error");
    expect(parseLogLine("[2026-09-04T06:40:20.284Z] [TRACE] noisy").level).toBe("debug");
  });

  // A bracketed prefix that is not a level must not be eaten as one.
  it("does not treat any bracketed word as a level", () => {
    const parsed = parseLogLine("[2026-09-04T06:40:20.284Z] [content-worker] listening");
    expect(parsed.message).toContain("[content-worker]");
  });
});

describe("parseLogLine — Docker's --timestamps prefix", () => {
  it("strips the prefix and keeps the nanosecond timestamp usable", () => {
    const parsed = parseLogLine("2026-09-07T09:28:57.954000000Z [content-worker] listening on queue");
    expect(parsed.ts).toBe("2026-09-07T09:28:57.954Z");
    expect(parsed.message).toBe("[content-worker] listening on queue");
  });

  // Docker wraps whatever the container printed, so a JSON line arrives with
  // an RFC3339 prefix in front of it and both layers have to come off.
  it("re-parses structured output that sits behind the prefix", () => {
    const line =
      '2026-09-07T09:28:58.576000000Z {"level":"error","ts":"2026-09-07T09:28:58.500Z","msg":"Worker failed"}';
    const parsed = parseLogLine(line);
    expect(parsed.level).toBe("error");
    expect(parsed.message).toBe("Worker failed");
    // The inner timestamp is the more precise one and wins.
    expect(parsed.ts).toBe("2026-09-07T09:28:58.500Z");
  });
});

describe("parseLogLine — structured JSON", () => {
  it("reads level and msg", () => {
    const parsed = parseLogLine('{"level":"info","ts":"2026-09-07T08:09:32.399Z","msg":"Namespace cache refreshed"}');
    expect(parsed.level).toBe("info");
    expect(parsed.message).toBe("Namespace cache refreshed");
  });

  it("falls back to the raw line when the JSON is truncated", () => {
    const truncated = '{"level":"info","msg":"half a lin';
    expect(parseLogLine(truncated).message).toBe(truncated);
  });
});

describe("parseLogLine — plain text", () => {
  it("infers a level from the text", () => {
    expect(parseLogLine("Error: Cannot find module").level).toBe("error");
    expect(parseLogLine("ready in 380ms").level).toBe("info");
  });

  it("strips a trailing carriage return", () => {
    expect(parseLogLine("compiled successfully\r").message).toBe("compiled successfully");
  });
});

describe("inferLevel", () => {
  // Matching the bare word "error" anywhere would paint half a Postgres log
  // red; the failure words have to actually indicate a failure.
  it("does not flag ordinary text that merely mentions errors", () => {
    expect(inferLevel("error_count column added")).toBe("info");
    expect(inferLevel("0 errors, 0 warnings")).toBe("info");
  });

  it("flags real failure shapes", () => {
    expect(inferLevel("ECONNREFUSED 127.0.0.1:7233")).toBe("error");
    expect(inferLevel("Unhandled promise rejection")).toBe("error");
    expect(inferLevel("failed to connect")).toBe("error");
  });

  it("flags warnings and retries", () => {
    expect(inferLevel("DeprecationWarning: punycode")).toBe("warn");
    expect(inferLevel("retrying in 2s")).toBe("warn");
  });
});

describe("splitLines", () => {
  // Stream chunks land mid-line often enough that ignoring the remainder
  // visibly corrupts output.
  it("returns whole lines and carries the partial forward", () => {
    const { lines, rest } = splitLines("one\ntwo\nthr");
    expect(lines).toEqual(["one", "two"]);
    expect(rest).toBe("thr");
  });

  it("treats a chunk ending on a newline as having no remainder", () => {
    const { lines, rest } = splitLines("one\ntwo\n");
    expect(lines).toEqual(["one", "two"]);
    expect(rest).toBe("");
  });
});

describe("redactSecrets — patterns", () => {
  it("masks AWS key ids at the documented length and beyond", () => {
    // AKIA + 16, the documented shape.
    expect(redactSecrets("using AKIAWVQ7EXAMPLE12345 for s3")).toBe(
      `using ${REDACTION_MASK} for s3`,
    );
    // One character longer. An exact-length pattern let this through, which is
    // the wrong direction for a redactor to be wrong in.
    expect(redactSecrets("using AKIAWVQ7EXAMPLE123456 for s3")).toBe(
      `using ${REDACTION_MASK} for s3`,
    );
    // Temporary and role key prefixes share the shape.
    expect(redactSecrets("role ASIAWVQ7EXAMPLE12345")).toBe(`role ${REDACTION_MASK}`);
  });

  it("does not mask ordinary uppercase words", () => {
    expect(redactSecrets("AKIA is a prefix")).toBe("AKIA is a prefix");
    expect(redactSecrets("SCHEDULED PARTIAL COMPLETED")).toBe("SCHEDULED PARTIAL COMPLETED");
  });

  it("masks bearer tokens but keeps the scheme readable", () => {
    expect(redactSecrets("authorization: Bearer sk-local-dev-abcdef123456")).toBe(
      `authorization: Bearer ${REDACTION_MASK}`,
    );
  });

  it("masks the password half of a connection string only", () => {
    expect(redactSecrets("postgresql://postgres:postgres@localhost:5432/insta_crossel")).toBe(
      `postgresql://postgres:${REDACTION_MASK}@localhost:5432/insta_crossel`,
    );
  });

  it("masks key-ish assignments and query parameters", () => {
    expect(redactSecrets("GET /v1beta/models?key=AQ.Ab8SecretValue123")).toContain(REDACTION_MASK);
    expect(redactSecrets('{"api_key": "abcdefgh12345678"}')).toContain(REDACTION_MASK);
    expect(redactSecrets("password=hunter2hunter2")).toContain(REDACTION_MASK);
  });

  it("masks provider key prefixes", () => {
    expect(redactSecrets("model key sk-ant-api03-abcdefghijkl")).toBe(`model key ${REDACTION_MASK}`);
  });

  // A redactor that mangles ordinary output is worse than none: nobody can
  // read the page and everyone turns it off.
  it("leaves ordinary log lines untouched", () => {
    const lines = [
      "[content-worker] listening on \"content-generation\" at localhost:7233",
      "Namespace cache refreshed.",
      "rendered slide 1 of 3 in 12480ms",
      "GET /api/posts 200 in 84ms",
    ];
    for (const line of lines) {
      expect(redactSecrets(line)).toBe(line);
    }
  });
});

describe("redactSecrets — environment values", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("masks a secret's literal value wherever it appears", () => {
    vi.stubEnv("GEMINI_API_KEY", "AQ.Ab8LongEnoughToMask");
    expect(redactSecrets("calling with AQ.Ab8LongEnoughToMask now")).toBe(
      `calling with ${REDACTION_MASK} now`,
    );
  });

  // Substituting a two-character secret would redact half of every line.
  it("ignores values too short to be distinctive", () => {
    vi.stubEnv("CRON_SECRET", "abc");
    expect(redactSecrets("abc appears in normal text")).toBe("abc appears in normal text");
  });

  it("masks the longest matching secret first", () => {
    vi.stubEnv("LITELLM_MASTER_KEY", "sk-local");
    vi.stubEnv("CRON_SECRET", "sk-local-dev-longer");
    const out = redactSecrets("token sk-local-dev-longer end");
    expect(out).toBe(`token ${REDACTION_MASK} end`);
  });
});

describe("resolveLogSource", () => {
  it("resolves each known key", () => {
    expect(resolveLogSource("worker")?.kind).toBe("file");
    expect(resolveLogSource("litellm")).toMatchObject({ kind: "container", container: "insta-crossel-litellm" });
  });

  // The client must never be able to name a container or a path.
  it("rejects anything not on the list", () => {
    expect(resolveLogSource("redis")).toBeNull();
    expect(resolveLogSource("insta-crossel-litellm")).toBeNull();
    expect(resolveLogSource("temporal; rm -rf /")).toBeNull();
    expect(resolveLogSource("../../etc/passwd")).toBeNull();
    expect(resolveLogSource(null)).toBeNull();
    expect(resolveLogSource(42)).toBeNull();
  });

  it("rejects inherited object properties", () => {
    expect(resolveLogSource("constructor")).toBeNull();
    expect(resolveLogSource("toString")).toBeNull();
  });
});

describe("clampTail", () => {
  it("clamps to a usable range and defaults on nonsense", () => {
    expect(clampTail("50")).toBe(50);
    expect(clampTail("0")).toBe(1);
    expect(clampTail("99999")).toBe(2000);
    expect(clampTail("abc")).toBe(200);
    expect(clampTail(undefined)).toBe(200);
    expect(clampTail("12.7")).toBe(12);
  });
});

describe("logStreamEnabled", () => {
  // `NODE_ENV` is typed read-only, so it is stubbed rather than assigned.
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is on outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ENABLE_LOG_STREAM", "");
    expect(logStreamEnabled()).toBe(true);
  });

  // The stream carries raw container output; it stays off in production
  // unless somebody has explicitly decided otherwise.
  it("is off in production unless explicitly enabled", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ENABLE_LOG_STREAM", "");
    expect(logStreamEnabled()).toBe(false);

    vi.stubEnv("ENABLE_LOG_STREAM", "true");
    expect(logStreamEnabled()).toBe(true);
  });
});
