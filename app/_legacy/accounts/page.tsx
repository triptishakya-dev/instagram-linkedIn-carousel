import { Card, CardHeader, EmptyState, Icon, KeyValue, Meter, Mono, PageHeader, Pill, PlatformMark } from "@/components/ui";
import { accounts, USER_TZ } from "@/lib/app-data";
import { daysUntil, fmtDateTime, platformChip } from "@/lib/format";

const VERSION_PINS = [
  {
    label: "Meta Graph API",
    value: "v26.0",
    env: "META_GRAPH_VERSION",
    note: "Expired versions do not error — Meta silently reroutes to an older one, so this is a calendar reminder, not a code constant.",
  },
  {
    label: "LinkedIn-Version",
    value: "202606",
    env: "LINKEDIN_API_VERSION",
    note: "Sent on every request alongside X-Restli-Protocol-Version: 2.0.0. Sunsets on roughly a one-year cycle.",
  },
];

const UNSUPPORTED = [
  "LinkedIn organic swipeable carousels — sponsored-only",
  "LinkedIn PDF document posts — no API surface in 2026",
  "LinkedIn articles, polls, native reposts",
  "LinkedIn @mentions — the text publishes literally",
  "Instagram Reels, Stories, video",
  "Personal (non-Professional) Instagram accounts",
];

export default function AccountsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Accounts"
        title="Grants, scopes and quota"
        description="One OAuth grant per provider, many destinations under it. A single Meta login yields several Pages with distinct page tokens, which is why the callback has a selection step."
      />

      {accounts.length === 0 ? (
        <EmptyState
          title="No provider connected"
          body="Connect a Meta or LinkedIn grant to pick up its destinations, scopes and publishing quota. Nothing can be scheduled until at least one destination is publishable."
        />
      ) : null}

      <div className="space-y-5">
        {accounts.map((a) => {
          const expiryDays = a.tokenExpiresAt ? daysUntil(a.tokenExpiresAt) : null;
          const expiryTone =
            expiryDays === null ? "idle" : expiryDays <= 3 ? "danger" : expiryDays <= 14 ? "warn" : "ok";

          return (
            <Card key={a.id}>
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium ${platformChip[a.platform]}`}
                  >
                    <PlatformMark platform={a.platform} className="h-3.5 w-3.5" />
                    {a.label}
                  </span>
                  {a.invalidatedAt ? (
                    <Pill tone="danger" dot>
                      Invalidated
                    </Pill>
                  ) : (
                    <Pill tone="ok" dot>
                      Connected
                    </Pill>
                  )}
                </div>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-fg transition-colors hover:bg-surface-3"
                >
                  <Icon name="refresh" className="h-3.5 w-3.5" />
                  Reconnect
                </button>
              </header>

              <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="space-y-5">
                  <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-subtle">
                      Token
                    </p>
                    <dl className="divide-y divide-line rounded-lg border border-line bg-surface-2 px-3">
                      <KeyValue
                        k="Expires"
                        v={
                          a.tokenExpiresAt ? (
                            <span className="inline-flex items-center gap-2">
                              {fmtDateTime(a.tokenExpiresAt, USER_TZ)}
                              <Pill tone={expiryTone}>{expiryDays}d</Pill>
                            </span>
                          ) : (
                            <span className="text-subtle">
                              No self-declared expiry — dies with the parent grant
                            </span>
                          )
                        }
                      />
                      <KeyValue
                        k="Refresh token"
                        v={
                          a.hasRefreshToken ? (
                            <Pill tone="ok">Granted — refreshed at day 50</Pill>
                          ) : a.platform === "LINKEDIN" ? (
                            <Pill tone="warn">Not granted — needs MDP approval</Pill>
                          ) : (
                            <Pill tone="idle">Not applicable — long-lived page token</Pill>
                          )
                        }
                      />
                      <KeyValue k="At rest" v={<Mono>AES-256-GCM · bytea · KEK v1</Mono>} />
                      <KeyValue k="Sent as" v={<Mono>Authorization header only</Mono>} />
                    </dl>
                    {a.platform === "LINKEDIN" && !a.hasRefreshToken ? (
                      <p className="mt-2 text-[11px] leading-relaxed text-warn">
                        Without a refresh token this is a 60-day clock, not a background renewal.
                        Scheduling is capped short of the expiry, and you are warned at T-14 and T-3.
                      </p>
                    ) : null}
                  </div>

                  <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-subtle">
                      Scopes
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {a.scopes.map((s) => (
                        <Mono key={s}>{s}</Mono>
                      ))}
                    </div>
                    {a.platform === "INSTAGRAM" ? (
                      <p className="mt-2 text-[11px] leading-relaxed text-subtle">
                        <Mono>instagram_basic</Mono> and <Mono>instagram_content_publish</Mono> were
                        deprecated 2025-01-27. Dropping Facebook as a target does not drop Meta:
                        a linked Page, Business Verification and App Review are all still required.
                      </p>
                    ) : null}
                  </div>

                  <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-subtle">
                      {a.quota.label}
                    </p>
                    <div className="flex items-center justify-between text-[11px] text-muted">
                      <span>{a.quota.window}</span>
                      <span className="font-mono">
                        {a.quota.used}/{a.quota.limit}
                      </span>
                    </div>
                    <div className="mt-2">
                      <Meter
                        value={a.quota.used}
                        max={a.quota.limit}
                        tone={a.quota.used / a.quota.limit > 0.6 ? "warn" : "run"}
                      />
                    </div>
                    {a.quota.note ? (
                      <p className="mt-1.5 text-[11px] leading-relaxed text-subtle">{a.quota.note}</p>
                    ) : null}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-subtle">
                    Destinations
                  </p>
                  <ul className="space-y-2">
                    {a.targets.map((t) => (
                      <li
                        key={t.id}
                        className={`rounded-lg border p-3 ${
                          t.connected ? "border-line bg-surface-2" : "border-line bg-surface-2/50"
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="flex items-center gap-2">
                            <span
                              className="grid h-6 w-6 place-items-center rounded text-white"
                              style={{ backgroundColor: t.avatarTint }}
                            >
                              <PlatformMark platform={t.platform} className="h-3 w-3" />
                            </span>
                            <span className="text-xs font-medium text-fg">{t.displayName}</span>
                          </span>
                          {t.connected ? (
                            <Pill tone="ok" dot>
                              Publishable
                            </Pill>
                          ) : (
                            <Pill tone="danger" dot>
                              Blocked
                            </Pill>
                          )}
                        </div>
                        <p className="mt-1.5 font-mono text-[10px] break-all text-subtle">
                          {t.urn ?? t.handle}
                        </p>
                        {t.blockedReason ? (
                          <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                            {t.blockedReason}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <CardHeader
            title="API version pins"
            hint="Kept in environment variables with calendar reminders, never in code."
          />
          <ul className="divide-y divide-line">
            {VERSION_PINS.map((v) => (
              <li key={v.env} className="px-5 py-3.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-fg">{v.label}</span>
                  <Mono>{v.value}</Mono>
                </div>
                <p className="mt-1 font-mono text-[10px] text-subtle">{v.env}</p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{v.note}</p>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader
            title="Not available on this plan"
            hint="Stated up front rather than discovered at publish time."
          />
          <ul className="space-y-2 p-5">
            {UNSUPPORTED.map((u) => (
              <li key={u} className="flex gap-2 text-[11px] leading-relaxed text-muted">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-line-strong" />
                {u}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="bg-surface-2">
        <div className="flex gap-3 px-5 py-4">
          <Icon name="shield" className="mt-0.5 h-4 w-4 shrink-0 text-subtle" />
          <p className="text-[11px] leading-relaxed text-muted">
            No API response on this page contains a token. Access tokens, refresh tokens, client
            secrets and LinkedIn upload URLs are never serialised to the browser and never logged —
            an upload URL is bearer-equivalent for its whole upload window.
          </p>
        </div>
      </Card>
    </div>
  );
}
