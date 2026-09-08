import { spawn } from "node:child_process";
import { open, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { NextResponse } from "next/server";
import { splitLines } from "@/lib/logs/parse";
import { redactSecrets } from "@/lib/logs/redact";
import {
  clampTail,
  logStreamEnabled,
  resolveLogSource,
  type LogSource,
} from "@/lib/logs/sources";

/**
 * GET /api/logs/stream?source=<key>&tail=<n> — live log output as SSE.
 *
 * Server-sent events rather than a socket: the traffic is one-way, an
 * `EventSource` reconnects on its own, and it needs no transport beyond the
 * route handler.
 *
 * **This is development tooling.** It streams raw process and container
 * output, which carries request bodies, connection strings and whatever else a
 * service decided to print. `logStreamEnabled` keeps it off in production,
 * `resolveLogSource` means the caller can never name a container or a path,
 * and `redactSecrets` filters known credential shapes on the way out. None of
 * that makes it safe to expose publicly.
 */

/** Node APIs and a long-lived stream: this cannot run on the edge. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 15_000;
const FILE_POLL_MS = 700;

type Emit = (event: string, data: unknown) => void;

export async function GET(req: Request) {
  if (!logStreamEnabled()) {
    // 404 rather than 403: in production this route does not exist.
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Not found." } }, { status: 404 });
  }

  const url = new URL(req.url);
  const source = resolveLogSource(url.searchParams.get("source"));

  if (!source) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "Unknown log source.", field: "source" } },
      { status: 400 },
    );
  }

  const tail = clampTail(url.searchParams.get("tail"));
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const cleanups: (() => void)[] = [];

      const emit: Emit = (event, data) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          // The consumer went away between the check and the enqueue.
          closed = true;
        }
      };

      const close = () => {
        if (closed) return;
        closed = true;
        for (const fn of cleanups) {
          try {
            fn();
          } catch {
            // A cleanup that throws must not stop the others from running.
          }
        }
        try {
          controller.close();
        } catch {
          // Already closed by the runtime.
        }
      };

      // Without this every page visit leaks a `docker logs --follow` child or
      // a polling timer for the lifetime of the server.
      req.signal.addEventListener("abort", close);

      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          // An SSE comment: keeps an idle connection from being dropped
          // without appearing as a log line.
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          close();
        }
      }, HEARTBEAT_MS);
      cleanups.push(() => clearInterval(heartbeat));

      emit("open", { source: source.key, label: source.label, tail });

      const started =
        source.kind === "file"
          ? followFile(source, tail, emit, close, cleanups)
          : followContainer(source, tail, emit, close, cleanups);

      started.catch((err) => {
        emit("fatal", { message: err instanceof Error ? err.message : String(err) });
        close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      // Nginx and friends buffer event streams into uselessness otherwise.
      "x-accel-buffering": "no",
    },
  });
}

/** Emits a batch of raw lines, redacted, dropping blanks. */
function emitLines(emit: Emit, lines: string[]) {
  const payload = lines.map((l) => l.replace(/\r$/, "")).filter((l) => l.length > 0);
  if (payload.length === 0) return;
  emit("lines", { lines: payload.map(redactSecrets) });
}

/**
 * Tails a file by polling its size and reading forward from an offset.
 *
 * Polling rather than `fs.watch`: on Windows `watch` does not reliably fire
 * for appends to a file another process holds open, which is exactly the case
 * here — the worker wrapper keeps its write stream open for its whole life.
 */
async function followFile(
  source: Extract<LogSource, { kind: "file" }>,
  tail: number,
  emit: Emit,
  close: () => void,
  cleanups: (() => void)[],
) {
  const path = resolve(process.cwd(), source.path);

  let offset = 0;
  try {
    const info = await stat(path);
    offset = info.size;
  } catch {
    emit("info", {
      message: `${source.path} does not exist yet. Start the worker with \`npm run worker\` — it writes this file.`,
    });
  }

  // History first: read the last chunk and keep only the requested lines, so a
  // long-running worker does not send megabytes on connect.
  if (offset > 0) {
    const HISTORY_BYTES = 256 * 1024;
    const from = Math.max(0, offset - HISTORY_BYTES);
    const handle = await open(path, "r").catch(() => null);
    if (handle) {
      try {
        const length = offset - from;
        const buffer = Buffer.alloc(length);
        await handle.read(buffer, 0, length, from);
        const text = buffer.toString("utf8");
        // A partial first line is likely when starting mid-file.
        const lines = text.split("\n");
        if (from > 0) lines.shift();
        emitLines(emit, lines.slice(-tail));
      } finally {
        await handle.close();
      }
    }
  }

  let rest = "";
  let reading = false;

  const poll = setInterval(async () => {
    if (reading) return;
    reading = true;
    try {
      const info = await stat(path).catch(() => null);
      if (!info) return;

      // A truncated or rotated file: start over rather than read garbage.
      if (info.size < offset) {
        offset = 0;
        rest = "";
        emit("info", { message: "Log file was truncated; following from the start." });
      }
      if (info.size === offset) return;

      const handle = await open(path, "r").catch(() => null);
      if (!handle) return;
      try {
        const length = info.size - offset;
        const buffer = Buffer.alloc(length);
        await handle.read(buffer, 0, length, offset);
        offset = info.size;
        const { lines, rest: carry } = splitLines(rest + buffer.toString("utf8"));
        rest = carry;
        emitLines(emit, lines);
      } finally {
        await handle.close();
      }
    } finally {
      reading = false;
    }
  }, FILE_POLL_MS);

  cleanups.push(() => clearInterval(poll));
  void close;
}

/**
 * Follows a container with `docker logs --follow`.
 *
 * argv array, never a shell string: the container name comes from the
 * allowlist, but building a command line by concatenation is how that stops
 * being true after the next edit.
 */
async function followContainer(
  source: Extract<LogSource, { kind: "container" }>,
  tail: number,
  emit: Emit,
  close: () => void,
  cleanups: (() => void)[],
) {
  const child = spawn(
    "docker",
    ["logs", "--follow", "--timestamps", "--tail", String(tail), source.container],
    { stdio: ["ignore", "pipe", "pipe"] },
  );

  cleanups.push(() => child.kill());

  let rest = "";
  const onChunk = (chunk: Buffer) => {
    const { lines, rest: carry } = splitLines(rest + chunk.toString("utf8"));
    rest = carry;
    emitLines(emit, lines);
  };

  // Docker writes container stdout and stderr to its own two streams; both are
  // log output here, so they are merged rather than distinguished.
  child.stdout.on("data", onChunk);
  child.stderr.on("data", onChunk);

  child.on("error", (err) => {
    const message =
      "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT"
        ? "Docker is not available on this machine, so container logs cannot be read."
        : err.message;
    emit("fatal", { message });
    close();
  });

  child.on("exit", (code) => {
    if (rest.trim()) emitLines(emit, [rest]);
    emit("ended", {
      // `docker logs --follow` only exits when the container stops or was
      // never there; either way there is nothing more to stream.
      message:
        code === 0
          ? `Stopped following ${source.container}.`
          : `docker logs exited with code ${code}. The container may not be running.`,
    });
    close();
  });
}
