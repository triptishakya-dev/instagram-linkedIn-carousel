import Link from "next/link";
import { Card, EmptyState, Icon, PageHeader } from "@/components/ui";
import { PostRow } from "@/components/post-bits";
import { posts } from "@/lib/mock-data";

const FILTERS = [
  { key: "ALL", label: "All" },
  { key: "SCHEDULED", label: "Scheduled" },
  { key: "PROCESSING", label: "Processing" },
  { key: "NEEDS_REVIEW", label: "Needs review" },
  { key: "FAILED", label: "Failed" },
  { key: "PUBLISHED", label: "Published" },
  { key: "PARTIALLY_PUBLISHED", label: "Partial" },
  { key: "DRAFT", label: "Drafts" },
] as const;

export default async function PostsPage(props: PageProps<"/posts">) {
  const { status } = await props.searchParams;
  const active = (Array.isArray(status) ? status[0] : status) ?? "ALL";

  const visible = posts
    .filter((p) => {
      if (active === "ALL") return true;
      // NEEDS_REVIEW lives on the target, never on the post
      if (active === "NEEDS_REVIEW") return p.targets.some((t) => t.status === "NEEDS_REVIEW");
      return p.status === active;
    })
    .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Posts"
        title="Every post, per target"
        description={
          <>
            <code className="rounded bg-surface-3 px-1 py-0.5 font-mono text-[11px]">
              Post.status
            </code>{" "}
            is derived, never written directly — a reducer recomputes it after each target write.
            That is why <em>partial</em> is a first-class outcome rather than an error.
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

      <nav className="flex flex-wrap gap-1.5" aria-label="Filter posts">
        {FILTERS.map((f) => {
          const isActive = active === f.key;
          const count =
            f.key === "ALL"
              ? posts.length
              : f.key === "NEEDS_REVIEW"
                ? posts.filter((p) => p.targets.some((t) => t.status === "NEEDS_REVIEW")).length
                : posts.filter((p) => p.status === f.key).length;
          return (
            <Link
              key={f.key}
              href={f.key === "ALL" ? "/posts" : `/posts?status=${f.key}`}
              aria-current={isActive ? "true" : undefined}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                isActive
                  ? "border-accent/30 bg-accent-soft text-accent"
                  : "border-line bg-surface text-muted hover:bg-surface-2"
              }`}
            >
              {f.label}
              <span className="font-mono text-[10px] opacity-70">{count}</span>
            </Link>
          );
        })}
      </nav>

      {visible.length === 0 ? (
        <EmptyState
          title="Nothing in this state"
          body="Try another filter — or compose something and pick both targets to see how a single post splits into two independent units of work."
        />
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {visible.map((p) => (
              <li key={p.id}>
                <PostRow post={p} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
