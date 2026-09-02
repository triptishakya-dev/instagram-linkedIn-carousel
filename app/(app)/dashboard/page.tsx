import Link from "next/link";
import {
  Card,
  CardHeader,
  Icon,
  KeyValue,
  Meter,
  PageHeader,
  Pill,
  PlatformMark,
  Mono,
} from "@/components/ui";
import { PostRow } from "@/components/post-bits";
import { accounts, NOW, posts, targetById, USER_TZ } from "@/lib/mock-data";
import {
  daysUntil,
  fmtDateTime,
  fmtRelative,
  humanStatus,
  platformChip,
  targetStatusTone,
  TARGET_FLOW,
} from "@/lib/format";

const IN_FLIGHT = new Set(["PREPARING", "READY", "PUBLISHING", "VERIFYING"]);

export default function DashboardPage() {
  const allTargets = posts.flatMap((p) => p.targets.map((t) => ({ post: p, target: t })));

  const needsReview = allTargets.filter((x) => x.target.status === "NEEDS_REVIEW");
  const inFlight = allTargets.filter((x) => IN_FLIGHT.has(x.target.status));
  const failed = allTargets.filter((x) => x.target.status === "FAILED");
  const scheduled = posts.filter((p) => p.status === "SCHEDULED");

  const upcoming = [...scheduled].sort(
    (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
  );

  const linkedin = accounts.find((a) => a.platform === "LINKEDIN")!;
  const expiryDays = linkedin.tokenExpiresAt ? daysUntil(linkedin.tokenExpiresAt) : null;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Overview"
        title="Publishing queue"
        description={
          <>
            The unit of work is a <em>target</em>, not a post. Each destination advances one state
            transition per cron tick, so a post can be live on one platform and still moving on the
            other.
          </>
        }
        action={
          <Link
            href="/composer"
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90"
          >
            <Icon name="compose" className="h-4 w-4" />
            New post
          </Link>
        }
      />

      {/* ------------------------------------------------ what needs a human */}
      {needsReview.length > 0 || (expiryDays !== null && expiryDays <= 14) ? (
        <div className="grid gap-4 md:grid-cols-2">
          {needsReview.length > 0 ? (
            <Card className="border-review/30 bg-review-soft/40">
              <div className="p-5">
                <div className="flex items-center gap-2">
                  <Icon name="alert" className="h-4 w-4 text-review" />
                  <h2 className="text-sm font-semibold text-fg">
                    {needsReview.length} target needs review
                  </h2>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted">
                  The create call may have landed and we cannot check. With member-only LinkedIn
                  scope the post cannot be read back, so nothing here is retried automatically —
                  silently double-posting to a professional profile is worse than an honest
                  &ldquo;we are not sure&rdquo;.
                </p>
                <ul className="mt-3 space-y-2">
                  {needsReview.map(({ post, target }) => (
                    <li key={target.id}>
                      <Link
                        href={`/posts/${post.id}`}
                        className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-2 transition-colors hover:bg-surface-2"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-xs text-fg">{post.caption}</span>
                          <span className="mt-0.5 block text-[11px] text-subtle">
                            {targetById(target.socialTargetId)?.handle} ·{" "}
                            {fmtRelative(post.scheduledAt)}
                          </span>
                        </span>
                        <Icon name="arrow" className="h-3.5 w-3.5 shrink-0 text-subtle" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
          ) : null}

          {expiryDays !== null && expiryDays <= 14 ? (
            <Card className="border-warn/30 bg-warn-soft/40">
              <div className="p-5">
                <div className="flex items-center gap-2">
                  <Icon name="clock" className="h-4 w-4 text-warn" />
                  <h2 className="text-sm font-semibold text-fg">
                    LinkedIn access expires in {expiryDays} days
                  </h2>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted">
                  Access tokens last 60 days. Refresh tokens come with Marketing Developer Platform
                  approval, and this grant does not have one — so this is a re-authorisation, not a
                  background refresh.
                </p>
                <dl className="mt-3 divide-y divide-line rounded-lg border border-line bg-surface px-3">
                  <KeyValue
                    k="Expires"
                    v={fmtDateTime(linkedin.tokenExpiresAt!, USER_TZ)}
                  />
                  <KeyValue k="Refresh token" v={<Pill tone="danger">Not granted</Pill>} />
                  <KeyValue
                    k="Scheduling capped at"
                    v={<Mono>2026-09-09 · expiry − 2d</Mono>}
                  />
                </dl>
                <Link
                  href="/accounts"
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
                >
                  Reconnect LinkedIn
                  <Icon name="arrow" className="h-3.5 w-3.5" />
                </Link>
              </div>
            </Card>
          ) : null}
        </div>
      ) : null}

      {/* ------------------------------------------------------------- stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Scheduled" value={scheduled.length} hint="posts waiting for their tick" />
        <Stat label="In flight" value={inFlight.length} hint="targets mid state-machine" tone="run" />
        <Stat label="Needs review" value={needsReview.length} hint="ambiguous, never auto-retried" tone="review" />
        <Stat label="Failed" value={failed.length} hint="terminal, classified by the publisher" tone="danger" />
      </div>

      {/* ---------------------------------------------------------- in flight */}
      <Card>
        <CardHeader
          title="In flight"
          hint="One transition per tick. Provider state is persisted between ticks so a timeout never restarts the whole publish."
        />
        {inFlight.length === 0 ? (
          <p className="px-5 py-8 text-center text-xs text-subtle">Queue is idle.</p>
        ) : (
          <ul className="divide-y divide-line">
            {inFlight.map(({ post, target }) => {
              const dest = targetById(target.socialTargetId)!;
              const stepIndex = TARGET_FLOW.indexOf(target.status);
              return (
                <li key={target.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium ${platformChip[dest.platform]}`}
                    >
                      <PlatformMark platform={dest.platform} className="h-3 w-3" />
                      {dest.handle}
                    </span>
                    <span className="text-[11px] text-subtle">
                      {target.lockedUntil
                        ? `lease held until ${fmtDateTime(target.lockedUntil, USER_TZ)}`
                        : "unleased — claimable next tick"}
                    </span>
                  </div>

                  <Link
                    href={`/posts/${post.id}`}
                    className="mt-2 block truncate text-sm text-fg hover:underline"
                  >
                    {post.caption}
                  </Link>

                  <ol className="mt-3 flex items-center gap-1">
                    {TARGET_FLOW.map((s, i) => (
                      <li key={s} className="flex flex-1 items-center gap-1">
                        <span
                          className={`h-1 flex-1 rounded-full ${
                            i < stepIndex
                              ? "bg-ok"
                              : i === stepIndex
                                ? "bg-accent"
                                : "bg-surface-3"
                          }`}
                          title={s}
                        />
                      </li>
                    ))}
                  </ol>
                  <div className="mt-1.5 flex items-center justify-between">
                    <Pill tone={targetStatusTone[target.status]} dot>
                      {humanStatus(target.status)}
                    </Pill>
                    <span className="font-mono text-[10px] text-subtle">
                      attempt {target.attemptCount}/{target.maxAttempts}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* -------------------------------------------------------------- quota */}
      <div className="grid gap-4 md:grid-cols-2">
        {accounts.map((a) => {
          const pct = Math.round((a.quota.used / a.quota.limit) * 100);
          return (
            <Card key={a.id}>
              <div className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium ${platformChip[a.platform]}`}
                  >
                    <PlatformMark platform={a.platform} className="h-3 w-3" />
                    {a.quota.label}
                  </span>
                  <span className="font-mono text-xs text-muted">
                    {a.quota.used}/{a.quota.limit}
                  </span>
                </div>
                <div className="mt-3">
                  <Meter value={a.quota.used} max={a.quota.limit} tone={pct > 60 ? "warn" : "run"} />
                </div>
                <p className="mt-2 text-[11px] text-subtle">
                  {a.quota.window}
                  {a.quota.note ? ` — ${a.quota.note}` : ""}
                </p>
              </div>
            </Card>
          );
        })}
      </div>

      {/* ----------------------------------------------------------- up next */}
      <Card>
        <CardHeader
          title="Up next"
          hint={`Times shown in ${USER_TZ}. Stored UTC, rendered in the zone the post was written in.`}
          action={
            <Link href="/calendar" className="text-xs font-medium text-accent hover:underline">
              Calendar
            </Link>
          }
        />
        <ul className="divide-y divide-line">
          {upcoming.map((p) => (
            <li key={p.id}>
              <PostRow post={p} />
            </li>
          ))}
        </ul>
      </Card>

      {/* --------------------------------------------------------- recent run */}
      <Card>
        <CardHeader title="Recently finished" hint="Terminal outcomes, most recent first." />
        <ul className="divide-y divide-line">
          {posts
            .filter((p) => ["PUBLISHED", "PARTIALLY_PUBLISHED", "FAILED"].includes(p.status))
            .sort(
              (a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime(),
            )
            .map((p) => (
              <li key={p.id}>
                <PostRow post={p} />
              </li>
            ))}
        </ul>
      </Card>

      <p className="pb-2 text-center text-[11px] text-subtle">
        Cron last ticked {fmtRelative(NOW)} · UI-only build, all data is fixture data
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone = "idle",
}: {
  label: string;
  value: number;
  hint: string;
  tone?: "idle" | "run" | "review" | "danger";
}) {
  const accent = {
    idle: "text-fg",
    run: "text-accent",
    review: "text-review",
    danger: "text-danger",
  }[tone];
  return (
    <Card className="p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-subtle">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${accent}`}>{value}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-subtle">{hint}</p>
    </Card>
  );
}
