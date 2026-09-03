"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon, Pill } from "./ui";

export function Navbar() {
  const [loading, setLoading] = useState(false);
  const [workerStatus, setWorkerStatus] = useState<"idle" | "running" | "success" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleStartWorker = async () => {
    try {
      setLoading(true);
      setWorkerStatus("running");
      setStatusMessage("Starting Temporal Image Worker process...");

      const response = await fetch("/api/worker/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setWorkerStatus("success");
        setStatusMessage(`Worker Task Launched! Generated ${data.task?.generatedAssetsCount || 3} assets in /public/generated-images/`);
      } else {
        setWorkerStatus("error");
        setStatusMessage(data.message || "Failed to start worker process.");
      }
    } catch (err: any) {
      setWorkerStatus("error");
      setStatusMessage(err.message || "Network error starting worker.");
    } finally {
      setLoading(false);

      // Reset message tone after 6 seconds
      setTimeout(() => {
        setWorkerStatus("idle");
        setStatusMessage(null);
      }, 6000);
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-line bg-surface/95 px-4 backdrop-blur sm:px-6 lg:px-8">
      {/* Left section: Title & Status */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard" className="flex items-center gap-2 text-sm font-semibold tracking-tight text-fg hover:opacity-80 transition-opacity">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-accent text-accent-fg">
            <Icon name="grid" className="h-4 w-4" />
          </span>
          <span>Dashboard</span>
        </Link>

        <span className="h-4 w-px bg-line" aria-hidden="true" />

        <Pill
          tone={
            workerStatus === "running"
              ? "run"
              : workerStatus === "success"
              ? "ok"
              : workerStatus === "error"
              ? "danger"
              : "idle"
          }
          dot
        >
          {workerStatus === "running"
            ? "Worker: Active"
            : workerStatus === "success"
            ? "Worker: Task Completed"
            : workerStatus === "error"
            ? "Worker: Failed"
            : "Worker: Idle"}
        </Pill>

        {statusMessage && (
          <span className="hidden text-xs text-subtle md:inline-block animate-fade-in truncate max-w-md">
            {statusMessage}
          </span>
        )}
      </div>

      {/* Right section: Action Buttons including "Start Worker" */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleStartWorker}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-emerald-500 hover:shadow disabled:opacity-50 active:scale-[0.98]"
          title="Trigger Temporal Background Image Generation Worker"
        >
          {loading ? (
            <Icon name="refresh" className="h-4 w-4 animate-spin" />
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
          <span>{loading ? "Starting..." : "Start Worker"}</span>
        </button>

        <Link
          href="/composer"
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-xs font-medium text-accent-fg transition-opacity hover:opacity-90"
        >
          <Icon name="compose" className="h-3.5 w-3.5" />
          <span>New Post</span>
        </Link>
      </div>
    </header>
  );
}
