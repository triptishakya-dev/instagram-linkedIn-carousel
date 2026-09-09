export const DAY = 86400000;

const NF = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export const inr = (n: number) => "₹" + NF.format(Math.round(n));

const NF2 = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Currency for figures that can be small.
 *
 * `inr` rounds to whole rupees, which is right for a budget cap or a model's
 * per-million-token rate. It is wrong for what a single call cost: at real
 * provider prices a caption runs under a rupee, so whole-rupee rounding turned
 * every usage figure into "₹0" or "₹3" and lost the difference between them.
 *
 * Paise below a hundred rupees, whole rupees above, so large totals stay
 * readable.
 */
export const inrCost = (n: number) => (Math.abs(n) < 100 ? "₹" + NF2.format(n) : inr(n));
export const num = (n: number) => NF.format(Math.round(n));

export const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const MON = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export const iso = (d: Date | number | string) => new Date(d).toISOString();

export function absDT(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  return (
    d.getDate() +
    " " +
    MON[d.getMonth()] +
    ", " +
    String(d.getHours()).padStart(2, "0") +
    ":" +
    String(d.getMinutes()).padStart(2, "0")
  );
}

/**
 * Absolute date and time, to the second.
 *
 * `absDT` stops at the minute, which is right for a schedule: a post is queued
 * for 09:30, never for 09:30:17. It is wrong for recording that something
 * happened. A run renders eight slides inside a couple of minutes, so
 * minute-precision timestamps collapse a whole carousel onto one value and
 * cannot be ordered by eye.
 *
 * The year is appended only when it differs from `now`, so the common case
 * stays narrow and an old row is still unambiguous. `now` is passed in for the
 * same hydration reason as `relDT`: reading the clock inside a formatter would
 * make prerendered markup disagree with the browser.
 */
export function absDTS(s: string | null | undefined, now?: number): string {
  if (!s) return "—";
  const d = new Date(s);
  const hms =
    String(d.getHours()).padStart(2, "0") +
    ":" +
    String(d.getMinutes()).padStart(2, "0") +
    ":" +
    String(d.getSeconds()).padStart(2, "0");

  const year =
    now !== undefined && new Date(now).getFullYear() !== d.getFullYear()
      ? " " + d.getFullYear()
      : "";

  return d.getDate() + " " + MON[d.getMonth()] + year + ", " + hms;
}

/**
 * Relative time against an explicit reference point. `now` is passed in rather
 * than read from the module so the value comes from the client clock captured
 * on mount — a module-level `new Date()` would be evaluated at prerender time
 * and disagree with the browser on hydration.
 *
 * Granular down to the second. It used to round everything under ninety minutes
 * to "an hour ago", which put a post finished four minutes ago and one finished
 * an hour ago under the same label — and a generation run is measured in
 * minutes, so that was most of what anyone wanted to tell apart.
 */
export function relDT(s: string | null | undefined, now: number): string {
  if (!s) return "";

  const diff = new Date(s).getTime() - now;
  const a = Math.abs(diff);

  // Below this, naming a number is less useful than saying it just happened.
  if (a < 5000) return "just now";

  const unit =
    a < 60000
      ? plural(Math.round(a / 1000), "second")
      : a < 3600000
        ? plural(Math.round(a / 60000), "minute")
        : a < DAY
          ? plural(Math.round(a / 3600000), "hour")
          : plural(Math.round(a / DAY), "day");

  return diff >= 0 ? "in " + unit : unit + " ago";
}

function plural(n: number, word: string): string {
  return n + " " + word + (n === 1 ? "" : "s");
}

export const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

export const fmtBytes = (b: number) =>
  b > 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.round(b / 1024) + " KB";

export const MONO = "ui-monospace,SFMono-Regular,Menlo,monospace";
