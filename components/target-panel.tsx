import {
  failureRetries,
  failureTone,
  fmtDateTime,
  humanStatus,
  mediaShape,
  platformAccent,
  targetStatusTone,
  TARGET_FLOW,
  toneBorder,
  toneDot,
  tonePanel,
  toneText,
} from "@/lib/format";
import { accountForTarget, targetById, USER_TZ } from "@/lib/app-data";
import type { Post, PublishTarget } from "@/lib/types";
import { Card, Icon, Mono, Pill, PlatformMark } from "./ui";

/** How far along the happy path this target got before it stopped. */
function reachedIndex(t: PublishTarget) {
  const i = TARGET_FLOW.indexOf(t.status);
  if (i >= 0) return i;
  // off-flow terminal: infer from the last successful attempt
  const last = [...t.attempts].reverse().find((a) => a.result === "OK");
  const to = last?.step.split("->")[1];
  return to ? Math.max(0, TARGET_FLOW.indexOf(to as never)) : 0;
}

export function TargetPanel({ post, target }: { post: Post; target: PublishTarget }) {
  const dest = targetById(target.socialTargetId)!;
  const account = accountForTarget(target.socialTargetId)!;
  const tone = targetStatusTone[target.status];
  const offFlow = TARGET_FLOW.indexOf(target.status) === -1;
  const reached = reachedIndex(target);
  const providerEntries = Object.entries(target.providerState);

  return (
    <Card>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span
            className="grid h-9 w-9 place-items-center rounded-lg text-white"
            style={{ backgroundColor: dest.avatarTint }}
          >
            <PlatformMark platform={dest.platform} className="h-4.5 w-4.5" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-fg">{dest.displayName}</p>
            <p className="text-[11px] text-subtle">
              {dest.handle} · {mediaShape(dest.platform, post.media.length)}
            </p>
          </div>
        </div>
        <Pill tone={tone} dot>
          {humanStatus(target.status)}
        </Pill>
      </header>

      <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* -------------------------------------------------- state machine */}
        <div>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-subtle">
            State machine
          </p>
          <ol className="relative space-y-0">
            {TARGET_FLOW.map((step, i) => {
              const done = i < reached || (!offFlow && i < TARGET_FLOW.indexOf(target.status));
              const current = !offFlow && step === target.status;
              const stopped = offFlow && i === reached;
              return (
                <li key={step} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span
                      className={`mt-1 grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 ${
                        done || current || stopped
                          ? current
                            ? "border-accent bg-accent"
                            : stopped
                              ? `${toneBorder[tone]} ${toneDot[tone]}`
                              : "border-ok bg-ok"
                          : "border-line-strong bg-surface"
                      }`}
                    >
                      {done && !current && !stopped ? (
                        <Icon name="check" className="h-2.5 w-2.5 text-surface" />
                      ) : null}
                    </span>
                    {i < TARGET_FLOW.length - 1 ? (
                      <span
                        className={`w-0.5 flex-1 ${
                          i < reached ? "bg-ok/50" : "bg-line"
                        } min-h-6`}
                      />
                    ) : null}
                  </div>
                  <div className="pb-4">
                    <p
                      className={`font-mono text-xs ${
                        current ? "font-semibold text-accent" : done ? "text-fg" : "text-subtle"
                      }`}
                    >
                      {step}
                    </p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-subtle">
                      {stepNote(dest.platform, step)}
                    </p>
                  </div>
                </li>
              );
            })}

            {offFlow ? (
              <li className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className={`mt-1 h-4 w-4 shrink-0 rounded-full ${toneDot[tone]}`} />
                </div>
                <div>
                  <p className={`font-mono text-xs font-semibold ${toneText[tone]}`}>
                    {target.status}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-subtle">
                    Branched off the happy path after{" "}
                    <Mono>{TARGET_FLOW[reached]}</Mono>.
                  </p>
                </div>
              </li>
            ) : null}
          </ol>
        </div>

        {/* ------------------------------------------------- error + state */}
        <div className="space-y-5">
          {target.error ? (
            <div
              className={`rounded-lg border p-4 ${
                target.failureClass ? tonePanel[failureTone[target.failureClass]] : tonePanel.idle
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                {target.failureClass ? (
                  <Pill tone={failureTone[target.failureClass]}>{target.failureClass}</Pill>
                ) : null}
                <span className="font-mono text-[10px] text-subtle">
                  attempt {target.attemptCount}/{target.maxAttempts}
                </span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-fg">{target.error}</p>
              {target.failureClass ? (
                <p className="mt-2 text-[11px] text-muted">
                  <span className="font-medium">Retry policy:</span>{" "}
                  {failureRetries[target.failureClass]}
                </p>
              ) : null}
            </div>
          ) : null}

          {target.status === "NEEDS_REVIEW" ? (
            <div className="rounded-lg border border-line bg-surface-2 p-4">
              <p className="text-xs font-semibold text-fg">Only you can resolve this</p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                Open {dest.displayName} and check whether the post is there, then tell us which it
                was. We will not guess and we will not re-send.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-fg transition-colors hover:bg-surface-3"
                >
                  It is live — mark published
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-fg transition-colors hover:bg-surface-3"
                >
                  It never posted — re-create
                </button>
              </div>
            </div>
          ) : null}

          {providerEntries.length > 0 ? (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-subtle">
                Provider state
              </p>
              <dl className="divide-y divide-line rounded-lg border border-line bg-surface-2 px-3">
                {providerEntries.map(([k, v]) => (
                  <div key={k} className="flex gap-3 py-2">
                    <dt className="w-40 shrink-0 font-mono text-[11px] text-subtle">{k}</dt>
                    <dd className="min-w-0 flex-1 font-mono text-[11px] break-all text-fg">
                      {Array.isArray(v) ? (
                        v.length === 0 ? (
                          <span className="text-subtle">[]</span>
                        ) : (
                          <span className="flex flex-wrap gap-1">
                            {v.map((item) => (
                              <span key={item} className="rounded bg-surface-3 px-1.5 py-0.5">
                                {item}
                              </span>
                            ))}
                          </span>
                        )
                      ) : v === null ? (
                        <span className="text-subtle">null</span>
                      ) : (
                        v
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-subtle">
              Attempts
            </p>
            {target.attempts.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line-strong px-3 py-4 text-center text-[11px] text-subtle">
                Not claimed yet.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {target.attempts.map((a) => (
                  <li
                    key={a.id}
                    className="rounded-lg border border-line bg-surface-2 px-3 py-2.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-[11px] text-fg">{a.step}</span>
                      <Pill
                        tone={a.result === "OK" ? "ok" : a.result === "RETRY" ? "warn" : "danger"}
                      >
                        {a.result}
                      </Pill>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-subtle">
                      <span>{fmtDateTime(a.at, USER_TZ)}</span>
                      <span className="font-mono">{a.durationMs} ms</span>
                      {a.errorCode ? (
                        <span className="font-mono text-danger">{a.errorCode}</span>
                      ) : null}
                      {a.traceId ? <span className="font-mono">{a.traceId}</span> : null}
                    </div>
                    {a.detail ? (
                      <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{a.detail}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="text-[10px] leading-relaxed text-subtle">
            Grant: <Mono>{account.label}</Mono> ·{" "}
            <span className={platformAccent[dest.platform]}>{account.scopes.join(" · ")}</span>
          </p>
        </div>
      </div>
    </Card>
  );
}

function stepNote(platform: "INSTAGRAM" | "LINKEDIN", step: string) {
  const ig: Record<string, string> = {
    PENDING: "Check content_publishing_limit, then create one child container per image.",
    PREPARING: "Poll each child until status_code=FINISHED, then create the parent container.",
    READY: "Parent container ready. media_publish is the single terminal call.",
    PUBLISHING: "creation_id is single-use — a duplicate publish errors instead of double-posting.",
    VERIFYING: "Not used on Instagram; publish is confirmed by the media id it returns.",
    PUBLISHED: "Live. Reconciliation can match on caption plus timestamp if a tick died.",
  };
  const li: Record<string, string> = {
    PENDING: "initializeUpload one image at a time, PUT the bytes immediately after each.",
    PREPARING: "Not used on LinkedIn — images are pushed, not polled.",
    READY: "All image URNs held in order. POST /rest/posts is next.",
    PUBLISHING: "The new post id comes back in the x-restli-id header, not the body.",
    VERIFYING: "PUBLISH_REQUESTED means not yet live. On PUBLISH_FAILED, update — never re-create.",
    PUBLISHED: "Live.",
  };
  return (platform === "INSTAGRAM" ? ig : li)[step] ?? "";
}
