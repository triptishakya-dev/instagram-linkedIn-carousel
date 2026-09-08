/**
 * Runs the content worker and tees its output to `logs/worker.log`.
 *
 * The worker is a plain Node process, not a container, so `docker logs` cannot
 * see it — and it is the one stream worth watching during a generation run.
 * This wrapper writes every line to a file the Logs page can tail while still
 * printing to the terminal, so nothing is lost either way.
 *
 * Lines are written as `[ISO] [LEVEL] message`, which is the format the log
 * file already used and which `lib/logs/parse.ts` understands.
 *
 * `package.json` already referenced this path from `worker:image` and
 * `worker:logs`; the file had gone missing, so both scripts were broken.
 */

import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const logPath = join(root, "logs", "worker.log");

mkdirSync(dirname(logPath), { recursive: true });

// Appended, not truncated: a restart should not erase the history of the run
// that just failed and prompted the restart.
const logFile = createWriteStream(logPath, { flags: "a" });

function write(level, text) {
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) continue;
    logFile.write(`[${new Date().toISOString()}] [${level}] ${line}\n`);
  }
}

/**
 * stderr is not failure.
 *
 * Node's own warnings, Temporal's SDK logging and most build tooling all write
 * to stderr at info level. Labelling the whole stream ERROR is what made the
 * previous log file read as a wall of red — so the level comes from the line's
 * own content, and only the exit code decides whether the run failed.
 */
function levelFor(line) {
  if (/\b(error|exception|fatal|panic|unhandled|failed)\b/i.test(line)) return "ERROR";
  if (/\bwarn(?:ing)?\b|Warning\b|\bdeprecat(?:ed|ion)\b/i.test(line)) return "WARN";
  return "INFO";
}

/**
 * Writing to a closed terminal throws EPIPE, which would kill the wrapper and
 * orphan the worker it spawned. `logs/worker.log` is the durable copy, so a
 * lost terminal is not worth taking a running generation down for.
 */
function safeWrite(target, line) {
  try {
    target.write(line + "\n");
  } catch {
    // Terminal went away; the file log still has this line.
  }
}

function relay(stream, target) {
  let rest = "";
  stream.on("data", (chunk) => {
    const text = rest + chunk.toString("utf8");
    const parts = text.split("\n");
    rest = parts.pop() ?? "";
    for (const line of parts) {
      if (!line.trim()) continue;
      safeWrite(target, line);
      write(levelFor(line), line);
    }
  });
  stream.on("end", () => {
    if (rest.trim()) {
      safeWrite(target, rest);
      write(levelFor(rest), rest);
    }
  });
}

const entry = join("worker", "start-content-worker.ts");

write("INFO", `--- worker starting (pid ${process.pid}) ---`);
console.log(`[run-worker] logging to ${logPath}`);

// `npx tsx` rather than a bare binary path, so this works on Windows without
// resolving .cmd shims by hand.
const child = spawn("npx", ["tsx", "--env-file=.env", entry], {
  cwd: root,
  stdio: ["inherit", "pipe", "pipe"],
  shell: process.platform === "win32",
});

relay(child.stdout, process.stdout);
relay(child.stderr, process.stderr);

// Ctrl-C should stop the worker rather than orphan it behind a dead wrapper.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    write("INFO", `--- received ${signal}, stopping worker ---`);
    child.kill(signal);
  });
}

child.on("exit", (code, signal) => {
  const how = signal ? `signal ${signal}` : `code ${code}`;
  write(code === 0 || signal ? "INFO" : "ERROR", `--- worker exited (${how}) ---`);
  logFile.end();
  process.exit(code ?? 0);
});

/**
 * However the wrapper goes down, the worker goes with it.
 *
 * Without this, a wrapper that dies for any reason other than its child
 * exiting leaves an orphaned worker polling the task queue indefinitely. They
 * accumulate fast, and each keeps running whatever version of the code it
 * started with — so a run can be picked up by stale logic with nothing on
 * screen to explain the result.
 *
 * This covers an exit the wrapper decides on: an error, a closed pipe, a
 * signal it can catch. It cannot cover being terminated from outside on
 * Windows, where `Stop-Process` and `taskkill /F` both map to TerminateProcess
 * and run no handlers. Stopping the worker with Ctrl-C, or by ending this
 * process normally, is the path that cleans up after itself.
 */
process.on("exit", () => {
  if (child.exitCode === null && !child.killed) child.kill();
});

child.on("error", (err) => {
  write("ERROR", `failed to spawn worker: ${err.message}`);
  logFile.end();
  process.exit(1);
});
