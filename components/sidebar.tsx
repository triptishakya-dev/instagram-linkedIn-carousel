"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./ui";

const nav: { href: string; label: string; icon: IconName; hint: string }[] = [
  { href: "/dashboard", label: "Overview", icon: "grid", hint: "Queue health and what needs you" },
  { href: "/composer", label: "Composer", icon: "compose", hint: "Write once, preview per target" },
  { href: "/posts", label: "Posts", icon: "list", hint: "Every post and its per-target state" },
  { href: "/calendar", label: "Calendar", icon: "calendar", hint: "Scheduled work by day" },
  { href: "/accounts", label: "Accounts", icon: "plug", hint: "Grants, scopes, tokens, quota" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary" className="flex flex-col gap-0.5">
      {nav.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
              active
                ? "bg-accent-soft font-medium text-accent"
                : "text-muted hover:bg-surface-3 hover:text-fg"
            }`}
          >
            <Icon name={item.icon} className="h-4 w-4 shrink-0" />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Primary"
      className="flex gap-1 overflow-x-auto border-b border-line bg-surface px-3 py-2 lg:hidden"
    >
      {nav.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              active ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-3"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
