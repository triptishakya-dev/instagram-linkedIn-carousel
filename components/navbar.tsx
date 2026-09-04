"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon, Pill } from "./ui";

interface GeneratedAsset {
  slideIndex: number;
  prompt: string;
  negativePrompt: string;
  aspectRatio: string;
  imageUrl: string;
  providerPrompts: {
    midjourney: string;
    dallE3: string;
    flux: string;
  };
}

interface WorkerTaskResult {
  topic: string;
  style: string;
  platform: string;
  generatedAssetsCount: number;
  assets: GeneratedAsset[];
}

export function Navbar() {
  const [loading, setLoading] = useState(false);
  const [workerStatus, setWorkerStatus] = useState<"idle" | "running" | "success" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [taskResult, setTaskResult] = useState<WorkerTaskResult | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null);

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

      if (response.ok && data.success && data.task) {
        setWorkerStatus("success");
        setTaskResult(data.task);
        setShowModal(true);
        setStatusMessage(`Generated ${data.task.generatedAssetsCount} asset(s) with new prompt engine!`);
      } else {
        setWorkerStatus("error");
        setStatusMessage(data.message || "Failed to start worker process.");
      }
    } catch (err: any) {
      setWorkerStatus("error");
      setStatusMessage(err.message || "Network error starting worker.");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, formatKey: string) => {
    navigator.clipboard.writeText(text);
    setCopiedFormat(formatKey);
    setTimeout(() => setCopiedFormat(null), 2000);
  };

  return (
    <>
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
          {taskResult && (
            <button
              onClick={() => setShowModal(true)}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-fg hover:bg-surface-2 transition-colors"
            >
              <Icon name="eye" className="h-3.5 w-3.5 text-accent" />
              <span>View Last Prompt</span>
            </button>
          )}

          <button
            onClick={handleStartWorker}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-emerald-500 hover:shadow disabled:opacity-50 active:scale-[0.98]"
            title="Trigger Temporal Background Image Generation Worker with New Prompt Engine"
          >
            {loading ? (
              <Icon name="refresh" className="h-4 w-4 animate-spin" />
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
            <span>{loading ? "Generating..." : "Start Worker"}</span>
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

      {/* Generated Prompt & Image Results Modal */}
      {showModal && taskResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-fade-in">
          <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl border border-line bg-surface shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-line bg-surface-2 px-6 py-4">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                  ✨
                </span>
                <div>
                  <h3 className="text-base font-bold text-fg">New Generated Prompt & Image Result</h3>
                  <p className="text-xs text-subtle">
                    Topic: <span className="font-semibold text-fg">&quot;{taskResult.topic}&quot;</span> · Style: <span className="uppercase text-accent font-mono text-[11px]">{taskResult.style}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="rounded-lg p-1.5 text-subtle hover:bg-surface-3 hover:text-fg transition-colors"
              >
                <Icon name="close" className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {taskResult.assets.map((asset) => (
                <div key={asset.slideIndex} className="space-y-4 rounded-xl border border-line bg-surface-2 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
                    <span className="font-semibold text-sm text-fg flex items-center gap-2">
                      <span className="rounded bg-accent/10 px-2 py-0.5 text-xs text-accent font-mono">Slide {asset.slideIndex}</span>
                      <span>Aspect Ratio: {asset.aspectRatio}</span>
                    </span>
                    <span className="text-xs text-emerald-400 font-medium">✓ Image Generated</span>
                  </div>

                  {/* Image Graphic Preview */}
                  <div className="flex justify-center rounded-xl overflow-hidden border border-line bg-black/40 p-2 max-h-80">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={asset.imageUrl}
                      alt={`Slide ${asset.slideIndex} generated asset`}
                      className="max-h-72 object-contain rounded-lg shadow-lg"
                    />
                  </div>

                  {/* Optimized Master Prompt */}
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-subtle mb-1.5">
                      Generated Master Prompt (6 Golden Rules Engineered)
                    </label>
                    <div className="rounded-lg border border-line bg-surface p-3 text-xs leading-relaxed text-fg font-mono select-all">
                      {asset.prompt}
                    </div>
                  </div>

                  {/* Provider Prompt Formats */}
                  <div className="grid gap-3 sm:grid-cols-3 pt-2">
                    {/* Midjourney Format */}
                    <div className="space-y-1.5 rounded-lg border border-line bg-surface p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-fg">Midjourney v6</span>
                        <button
                          onClick={() => copyToClipboard(asset.providerPrompts.midjourney, `mj-${asset.slideIndex}`)}
                          className="text-[10px] font-medium text-accent hover:underline"
                        >
                          {copiedFormat === `mj-${asset.slideIndex}` ? "Copied! ✓" : "Copy Prompt"}
                        </button>
                      </div>
                      <p className="font-mono text-[10px] text-subtle truncate select-all">
                        {asset.providerPrompts.midjourney}
                      </p>
                    </div>

                    {/* DALL-E 3 Format */}
                    <div className="space-y-1.5 rounded-lg border border-line bg-surface p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-fg">DALL-E 3</span>
                        <button
                          onClick={() => copyToClipboard(asset.providerPrompts.dallE3, `dalle-${asset.slideIndex}`)}
                          className="text-[10px] font-medium text-accent hover:underline"
                        >
                          {copiedFormat === `dalle-${asset.slideIndex}` ? "Copied! ✓" : "Copy Prompt"}
                        </button>
                      </div>
                      <p className="font-mono text-[10px] text-subtle truncate select-all">
                        {asset.providerPrompts.dallE3}
                      </p>
                    </div>

                    {/* Flux Format */}
                    <div className="space-y-1.5 rounded-lg border border-line bg-surface p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-fg">Flux / SDXL</span>
                        <button
                          onClick={() => copyToClipboard(asset.providerPrompts.flux, `flux-${asset.slideIndex}`)}
                          className="text-[10px] font-medium text-accent hover:underline"
                        >
                          {copiedFormat === `flux-${asset.slideIndex}` ? "Copied! ✓" : "Copy Prompt"}
                        </button>
                      </div>
                      <p className="font-mono text-[10px] text-subtle truncate select-all">
                        {asset.providerPrompts.flux}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-line bg-surface-2 px-6 py-3.5">
              <span className="text-xs text-subtle">
                Saved on disk in <code className="font-mono text-[11px] text-fg">/public/generated-images/</code>
              </span>
              <div className="flex gap-2">
                <button
                  onClick={handleStartWorker}
                  disabled={loading}
                  className="rounded-lg border border-line bg-surface px-4 py-2 text-xs font-semibold text-fg hover:bg-surface-3 transition-colors disabled:opacity-50"
                >
                  {loading ? "Generating..." : "Generate Another Prompt"}
                </button>
                <button
                  onClick={() => setShowModal(false)}
                  className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-accent-fg hover:opacity-90 transition-opacity"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

