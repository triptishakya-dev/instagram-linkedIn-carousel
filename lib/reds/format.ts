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
 * Relative time against an explicit reference point. `now` is passed in rather
 * than read from the module so the value comes from the client clock captured
 * on mount — a module-level `new Date()` would be evaluated at prerender time
 * and disagree with the browser on hydration.
 */
export function relDT(s: string | null | undefined, now: number): string {
  if (!s) return "";
  const diff = new Date(s).getTime() - now;
  const a = Math.abs(diff);
  const d = Math.round(a / DAY);
  const h = Math.round(a / 3600000);
  const unit = d >= 1 ? (d === 1 ? "1 day" : d + " days") : h <= 1 ? "an hour" : h + " hours";
  return diff >= 0 ? "in " + unit : unit + " ago";
}

export const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

export const fmtBytes = (b: number) =>
  b > 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.round(b / 1024) + " KB";

export const MONO = "ui-monospace,SFMono-Regular,Menlo,monospace";
