import type { ReactNode } from "react";
import Link from "next/link";
import { MobileNav, Sidebar } from "@/components/sidebar";
import { Navbar } from "@/components/navbar";
import { Icon, Pill } from "@/components/ui";
import { accounts, posts } from "@/lib/app-data";
import { daysUntil } from "@/lib/format";

export default function AppLayout({ children }: { children: ReactNode }) {
  const needsReview = posts
    .flatMap((p) => p.targets)
    .filter((t) => t.status === "NEEDS_REVIEW").length;

  const linkedin = accounts.find((a) => a.platform === "LINKEDIN");
  const expiryDays = linkedin?.tokenExpiresAt ? daysUntil(linkedin.tokenExpiresAt) : null;

  return (
    <div className="flex min-h-full flex-1 flex-col lg:flex-row">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-surface lg:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-accent-fg">
            <Icon name="calendar" className="h-4 w-4" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold tracking-tight">Social Scheduler</p>
            <p className="text-[11px] text-subtle">Instagram · LinkedIn</p>
          </div>
        </div>

        <div className="px-3">
          <Link
            href="/composer"
            className="mb-4 flex items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90"
          >
            <Icon name="compose" className="h-4 w-4" />
            New post
          </Link>
          <Sidebar />
        </div>

        <div className="mt-auto space-y-2 p-3">
          {needsReview > 0 ? (
            <Link
              href="/posts?status=NEEDS_REVIEW"
              className="block rounded-lg border border-review/25 bg-review-soft p-3 transition-opacity hover:opacity-90"
            >
              <p className="flex items-center gap-1.5 text-xs font-semibold text-review">
                <Icon name="alert" className="h-3.5 w-3.5" />
                {needsReview} needs review
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted">
                We could not confirm these went through. Nothing is retried automatically.
              </p>
            </Link>
          ) : null}

          {expiryDays !== null && expiryDays <= 14 ? (
            <Link
              href="/accounts"
              className="block rounded-lg border border-warn/25 bg-warn-soft p-3 transition-opacity hover:opacity-90"
            >
              <p className="flex items-center gap-1.5 text-xs font-semibold text-warn">
                <Icon name="clock" className="h-3.5 w-3.5" />
                LinkedIn expires in {expiryDays}d
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted">
                No refresh token on this grant. Reconnect, or posts scheduled past that date will
                fail.
              </p>
            </Link>
          ) : null}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <Navbar />
        <div className="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3 lg:hidden">
          <span className="text-sm font-semibold tracking-tight">Social Scheduler</span>
          {needsReview > 0 ? (
            <Pill tone="review" dot>
              {needsReview} to review
            </Pill>
          ) : null}
        </div>
        <MobileNav />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
