import type { ReactNode } from "react";
import { toneClass, toneDot, type Tone } from "@/lib/format";
import type { Platform, PostMedia } from "@/lib/types";

/* ------------------------------------------------------------- surfaces -- */

export function Card({
  children,
  className = "",
  as: Tag = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article" | "aside";
}) {
  return (
    <Tag
      className={`rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${className}`}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  hint,
  action,
}: {
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-3.5">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold tracking-tight text-fg">{title}</h2>
        {hint ? <p className="mt-0.5 text-xs leading-relaxed text-subtle">{hint}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        {eyebrow ? (
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-subtle">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
        {description ? (
          <p className="mt-2 text-sm leading-relaxed text-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

/* ---------------------------------------------------------------- chips -- */

export function Pill({
  children,
  tone = "idle",
  dot = false,
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium ${toneClass[tone]} ${className}`}
    >
      {dot ? <span className={`h-1.5 w-1.5 rounded-full ${toneDot[tone]}`} /> : null}
      {children}
    </span>
  );
}

export function Mono({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <code className={`rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] text-muted ${className}`}>
      {children}
    </code>
  );
}

export function Meter({
  value,
  max,
  tone = "run",
}: {
  value: number;
  max: number;
  tone?: Tone;
}) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
      <div
        className={`h-full rounded-full ${toneDot[tone]}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/* ---------------------------------------------------------------- icons -- */

export function PlatformMark({
  platform,
  className = "h-4 w-4",
}: {
  platform: Platform;
  className?: string;
}) {
  if (platform === "INSTAGRAM") {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.7" />
        <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.7" />
        <circle cx="17.2" cy="6.8" r="1.15" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.7" />
      <path d="M7.5 10.2V17M7.5 7.4v.1" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path
        d="M11.4 17v-3.7c0-1.5.9-2.5 2.3-2.5s2.3 1 2.3 2.5V17"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path d="M11.4 10.4V17" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function Icon({ name, className = "h-4 w-4" }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

export type IconName =
  | "grid"
  | "compose"
  | "list"
  | "calendar"
  | "plug"
  | "alert"
  | "clock"
  | "check"
  | "arrow"
  | "image"
  | "shield"
  | "refresh"
  | "eye"
  | "close";

const paths: Record<IconName, ReactNode> = {
  grid: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </>
  ),
  compose: (
    <>
      <path d="M4 20h16" />
      <path d="M15.2 4.6a2 2 0 0 1 2.8 2.8L8.6 16.8l-3.6.9.9-3.6z" />
    </>
  ),
  list: (
    <>
      <path d="M8 6h12M8 12h12M8 18h12" />
      <path d="M4 6h.01M4 12h.01M4 18h.01" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" />
    </>
  ),
  plug: (
    <>
      <path d="M9 3.5v5M15 3.5v5" />
      <path d="M6.5 8.5h11v3a5.5 5.5 0 0 1-11 0z" />
      <path d="M12 17v3.5" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4.5 21 19.5H3z" />
      <path d="M12 10v4M12 17h.01" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 1.8" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  arrow: (
    <>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m4.5 17.5 4.8-4.4 4 3.4 2.6-2.2 3.6 3.2" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.5 19 6v6c0 4-3 7-7 8.5C8 19 5 16 5 12V6z" />
      <path d="m9.2 12 2 2 3.6-3.8" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11.5A8 8 0 0 0 6.3 6.3L4 8.5" />
      <path d="M4 12.5a8 8 0 0 0 13.7 5.2L20 15.5" />
      <path d="M4 4.5v4h4M20 19.5v-4h-4" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  close: (
    <>
      <path d="M18 6L6 18M6 6l12 12" />
    </>
  ),
};

/* ---------------------------------------------------------------- media -- */

export const aspectClass: Record<PostMedia["aspect"], string> = {
  "1:1": "aspect-square",
  "4:5": "aspect-[4/5]",
  "1.91:1": "aspect-[1.91/1]",
};

export function MediaTile({
  media,
  index,
  className = "",
  forcedAspect,
  noteCrop = true,
}: {
  media: PostMedia;
  index?: number;
  className?: string;
  forcedAspect?: PostMedia["aspect"];
  /** The crop badge is worth saying in a preview and noise in a thumbnail. */
  noteCrop?: boolean;
}) {
  const aspect = forcedAspect ?? media.aspect;
  const cropped = noteCrop && forcedAspect !== undefined && forcedAspect !== media.aspect;
  return (
    <div
      className={`mediaframe relative overflow-hidden rounded-lg border border-line ${aspectClass[aspect]} ${className}`}
      style={{
        backgroundImage: `linear-gradient(150deg, ${media.tint}, transparent 68%), linear-gradient(30deg, ${media.tint}55, transparent 60%)`,
      }}
      title={media.fileName}
    >
      {index !== undefined ? (
        <span className="absolute left-2 top-2 rounded bg-black/45 px-1.5 py-0.5 font-mono text-[10px] text-white">
          {index + 1}
        </span>
      ) : null}
      {cropped ? (
        <span className="absolute bottom-2 left-2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white">
          cropped from {media.aspect}
        </span>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------- layout -- */

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line-strong px-6 py-12 text-center">
      <p className="text-sm font-medium text-fg">{title}</p>
      <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-subtle">{body}</p>
    </div>
  );
}

export function KeyValue({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="shrink-0 text-xs text-subtle">{k}</dt>
      <dd className="min-w-0 text-right text-xs text-fg">{v}</dd>
    </div>
  );
}
