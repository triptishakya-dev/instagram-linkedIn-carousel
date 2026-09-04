import Link from "next/link";
import { Card, CardHeader, Icon, PageHeader, Pill, PlatformMark } from "@/components/ui";
import { now, posts, targetById, USER_TZ } from "@/lib/app-data";
import {
  dayKey,
  fmtTime,
  humanStatus,
  platformChip,
  postStatusTone,
  toneDot,
} from "@/lib/format";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function CalendarPage(props: PageProps<"/calendar">) {
  const { m } = await props.searchParams;
  const today = now();
  const monthParam = (Array.isArray(m) ? m[0] : m) ?? dayKey(today, USER_TZ).slice(0, 7);
  const [year, month] = monthParam.split("-").map(Number);

  // Built in UTC so the grid never depends on the server's own zone.
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const leading = (firstOfMonth.getUTCDay() + 6) % 7; // Monday-first
  const cells = Array.from({ length: leading + daysInMonth }, (_, i) =>
    i < leading ? null : i - leading + 1,
  );

  const byDay = new Map<string, typeof posts>();
  for (const p of posts) {
    const key = dayKey(p.scheduledAt, USER_TZ);
    byDay.set(key, [...(byDay.get(key) ?? []), p]);
  }

  const prev = month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
  const next = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
  const todayKey = dayKey(today, USER_TZ);

  const monthPosts = posts
    .filter((p) => dayKey(p.scheduledAt, USER_TZ).startsWith(monthParam))
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Calendar"
        title={`${MONTHS[month - 1]} ${year}`}
        description={`Days are bucketed in ${USER_TZ}. A post written in one zone keeps that zone — the calendar does not re-interpret it against the server clock.`}
        action={
          <div className="flex gap-1.5">
            <Link
              href={`/calendar?m=${prev}`}
              className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-3"
            >
              <Icon name="arrow" className="h-3.5 w-3.5 rotate-180" />
            </Link>
            <Link
              href={`/calendar?m=${next}`}
              className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-3"
            >
              <Icon name="arrow" className="h-3.5 w-3.5" />
            </Link>
          </div>
        }
      />

      <Card className="overflow-hidden">
        <div className="grid grid-cols-7 border-b border-line bg-surface-2">
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-subtle"
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            if (day === null) {
              return <div key={`pad-${i}`} className="min-h-24 border-b border-r border-line bg-surface-2/40" />;
            }
            const key = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const dayPosts = byDay.get(key) ?? [];
            const isToday = key === todayKey;
            return (
              <div
                key={key}
                className={`min-h-24 border-b border-r border-line p-1.5 ${isToday ? "bg-accent-soft/40" : ""}`}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span
                    className={`text-[11px] tabular-nums ${isToday ? "font-semibold text-accent" : "text-subtle"}`}
                  >
                    {day}
                  </span>
                  {isToday ? (
                    <span className="text-[9px] font-medium uppercase text-accent">today</span>
                  ) : null}
                </div>
                <ul className="space-y-1">
                  {dayPosts.map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/posts/${p.id}`}
                        className="block rounded border border-line bg-surface px-1.5 py-1 transition-colors hover:bg-surface-3"
                      >
                        <span className="flex items-center gap-1">
                          <span
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${toneDot[postStatusTone[p.status]]}`}
                          />
                          <span className="font-mono text-[9px] text-subtle">
                            {fmtTime(p.scheduledAt, USER_TZ)}
                          </span>
                        </span>
                        <span className="mt-0.5 flex gap-0.5">
                          {p.targets
                            .filter((t) => t.status !== "SKIPPED")
                            .map((t) => {
                              const dest = targetById(t.socialTargetId);
                              return dest ? (
                                <PlatformMark
                                  key={t.id}
                                  platform={dest.platform}
                                  className={`h-3 w-3 ${dest.platform === "INSTAGRAM" ? "text-ig" : "text-li"}`}
                                />
                              ) : null;
                            })}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <CardHeader
          title={`${MONTHS[month - 1]} agenda`}
          hint="Every post in this month, in the order the dispatcher will reach it."
        />
        {monthPosts.length === 0 ? (
          <p className="px-5 py-8 text-center text-xs text-subtle">Nothing scheduled this month.</p>
        ) : (
          <ul className="divide-y divide-line">
            {monthPosts.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/posts/${p.id}`}
                  className="flex items-start gap-4 px-5 py-3.5 transition-colors hover:bg-surface-2"
                >
                  <span className="w-16 shrink-0 font-mono text-[11px] text-subtle">
                    {dayKey(p.scheduledAt, USER_TZ).slice(5)}
                    <span className="block text-fg">{fmtTime(p.scheduledAt, USER_TZ)}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <Pill tone={postStatusTone[p.status]} dot>
                        {humanStatus(p.status)}
                      </Pill>
                      {p.targets
                        .filter((t) => t.status !== "SKIPPED")
                        .map((t) => {
                          const dest = targetById(t.socialTargetId);
                          return dest ? (
                            <span
                              key={t.id}
                              className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${platformChip[dest.platform]}`}
                            >
                              <PlatformMark platform={dest.platform} className="h-2.5 w-2.5" />
                              {dest.handle}
                            </span>
                          ) : null;
                        })}
                    </span>
                    <span className="mt-1 block truncate text-xs text-fg">{p.caption}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
