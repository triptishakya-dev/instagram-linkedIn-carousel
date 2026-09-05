/**
 * Wall-clock ↔ instant conversion, without a date library.
 *
 * The composer collects a date, a time and a zone. The database stores a UTC
 * instant plus the zone as a separate column, because a stored fixed offset
 * would silently drift the moment that zone crosses a DST boundary.
 */

type WallClock = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const PART_TYPES = ["year", "month", "day", "hour", "minute", "second"] as const;

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let fmt = formatterCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatterCache.set(timeZone, fmt);
  }
  return fmt;
}

/** True when the runtime's ICU data recognises the zone. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** The wall-clock reading an observer in `timeZone` sees at `instant`. */
export function wallClockIn(instant: Date, timeZone: string): WallClock {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const out: Record<string, number> = {};
  for (const part of parts) {
    if ((PART_TYPES as readonly string[]).includes(part.type)) {
      out[part.type] = Number(part.value);
    }
  }
  return {
    year: out.year,
    month: out.month,
    day: out.day,
    // h23 still reports midnight as 24 in some ICU builds.
    hour: out.hour === 24 ? 0 : out.hour,
    minute: out.minute,
    second: out.second,
  };
}

/** `localTime - utcTime` at a given instant, in milliseconds. */
function offsetMsAt(instant: Date, timeZone: string): number {
  const w = wallClockIn(instant, timeZone);
  const asIfUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asIfUtc - instant.getTime();
}

function matchesWallClock(instant: Date, timeZone: string, target: WallClock): boolean {
  const w = wallClockIn(instant, timeZone);
  return (
    w.year === target.year &&
    w.month === target.month &&
    w.day === target.day &&
    w.hour === target.hour &&
    w.minute === target.minute
  );
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})$/;

/**
 * Resolves `YYYY-MM-DD` + `HH:mm` in `timeZone` to the UTC instant it names.
 *
 * DST behaviour matches Temporal's `compatible` disambiguation:
 * - Ambiguous times (the hour that repeats on fall-back) resolve to the
 *   *earlier* of the two instants.
 * - Nonexistent times (the hour skipped on spring-forward) shift *forward* by
 *   the length of the gap, so 02:30 on a US spring-forward date becomes 03:30
 *   local rather than silently landing an hour before the user's intent.
 *
 * @throws {RangeError} on an unparseable date, time, or zone.
 */
export function zonedToUtc(date: string, time: string, timeZone: string): Date {
  const dateMatch = DATE_RE.exec(date);
  if (!dateMatch) throw new RangeError(`Expected date as YYYY-MM-DD, got "${date}".`);

  const timeMatch = TIME_RE.exec(time);
  if (!timeMatch) throw new RangeError(`Expected time as HH:mm, got "${time}".`);

  if (!isValidTimeZone(timeZone)) throw new RangeError(`Unknown time zone "${timeZone}".`);

  const target: WallClock = {
    year: Number(dateMatch[1]),
    month: Number(dateMatch[2]),
    day: Number(dateMatch[3]),
    hour: Number(timeMatch[1]),
    minute: Number(timeMatch[2]),
    second: 0,
  };

  if (target.month < 1 || target.month > 12) throw new RangeError(`Invalid month in "${date}".`);
  if (target.day < 1 || target.day > 31) throw new RangeError(`Invalid day in "${date}".`);
  if (target.hour > 23) throw new RangeError(`Invalid hour in "${time}".`);
  if (target.minute > 59) throw new RangeError(`Invalid minute in "${time}".`);

  // Read the requested wall clock as if it were UTC, then subtract the zone's
  // offset. The offset itself depends on the instant, so this needs a second
  // pass whenever the first guess lands on the other side of a transition.
  const naive = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute);

  const firstPass = new Date(naive - offsetMsAt(new Date(naive), timeZone));
  if (matchesWallClock(firstPass, timeZone, target)) return firstPass;

  const secondPass = new Date(naive - offsetMsAt(firstPass, timeZone));
  if (matchesWallClock(secondPass, timeZone, target)) return secondPass;

  // Neither instant reads back as the requested time: it does not exist in this
  // zone. The first pass is the forward-shifted one.
  return firstPass;
}

/** `YYYY-MM-DD` for an instant as seen in `timeZone`. */
export function zonedDateString(instant: Date, timeZone: string): string {
  const w = wallClockIn(instant, timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${w.year}-${pad(w.month)}-${pad(w.day)}`;
}
