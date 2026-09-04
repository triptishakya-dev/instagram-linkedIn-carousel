import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardHeader, Icon, KeyValue, MediaTile, Mono, Pill } from "@/components/ui";
import { TargetPanel } from "@/components/target-panel";
import { postById, posts, targetById } from "@/lib/app-data";
import {
  fmtBytes,
  fmtDateTime,
  fmtRelative,
  humanStatus,
  postStatusTone,
  targetStatusTone,
} from "@/lib/format";

export function generateStaticParams() {
  return posts.map((p) => ({ id: p.id }));
}

export default async function PostDetailPage(props: PageProps<"/posts/[id]">) {
  const { id } = await props.params;
  const post = postById(id);
  if (!post) notFound();

  const live = post.targets.filter((t) => t.status !== "SKIPPED");
  const skipped = post.targets.filter((t) => t.status === "SKIPPED");
  const published = live.filter((t) => t.status === "PUBLISHED").length;
  // NEEDS_REVIEW is terminal too — it settles the target even though it did not publish.
  const failed = live.filter((t) => t.status === "FAILED" || t.status === "NEEDS_REVIEW").length;

  const derived =
    published === live.length
      ? "published === live.length → PUBLISHED"
      : failed === live.length
        ? "failed === live.length → FAILED"
        : published + failed === live.length
          ? "published + failed === live.length → PARTIALLY_PUBLISHED"
          : "still moving → PROCESSING";

  return (
    <div className="space-y-6">
      <Link
        href="/posts"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-fg"
      >
        <Icon name="arrow" className="h-3.5 w-3.5 rotate-180" />
        All posts
      </Link>

      <header className="flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={postStatusTone[post.status]} dot>
              {humanStatus(post.status)}
            </Pill>
            <Mono>{post.id}</Mono>
          </div>
          <p className="mt-3 text-lg leading-relaxed text-fg">{post.caption}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-fg transition-colors hover:bg-surface-3"
          >
            Duplicate
          </button>
          <button
            type="button"
            className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-fg transition-colors hover:bg-surface-3"
          >
            Edit
          </button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title={`Media · ${post.media.length} ${post.media.length === 1 ? "image" : "images"}`}
            hint="Stored at a durable, publicly fetchable URL — Instagram cURLs it at publish time, and a short-TTL signed URL would be dead by then."
          />
          <div className="grid grid-cols-3 gap-2 p-5 sm:grid-cols-5">
            {post.media.map((m, i) => (
              <figure key={m.id}>
                <MediaTile media={m} index={i} />
                <figcaption className="mt-1 truncate font-mono text-[10px] text-subtle">
                  {fmtBytes(m.bytes)} · {m.aspect}
                </figcaption>
              </figure>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Schedule" />
          <dl className="divide-y divide-line px-5">
            <KeyValue
              k="Scheduled"
              v={
                <>
                  {fmtDateTime(post.scheduledAt, post.timezone)}
                  <span className="ml-1.5 text-subtle">{fmtRelative(post.scheduledAt)}</span>
                </>
              }
            />
            <KeyValue k="Zone" v={<Mono>{post.timezone}</Mono>} />
            <KeyValue
              k="Stored"
              v={<Mono>{post.scheduledAt.replace(".000Z", "Z")}</Mono>}
            />
            <KeyValue
              k="Stale after"
              v={
                <>
                  {post.staleAfterMinutes} min
                  <span className="ml-1.5 text-subtle">then it fails instead of posting late</span>
                </>
              }
            />
            <KeyValue
              k="Post.status"
              v={<span className="font-mono text-[11px]">{derived}</span>}
            />
          </dl>
        </Card>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold tracking-tight text-fg">
          Targets · {live.length} independent {live.length === 1 ? "unit" : "units"} of work
        </h2>
        <div className="space-y-5">
          {live.map((t) => (
            <TargetPanel key={t.id} post={post} target={t} />
          ))}
        </div>
      </div>

      {skipped.length > 0 ? (
        <Card className="bg-surface-2">
          <div className="px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">Skipped</p>
            <ul className="mt-2 space-y-1.5">
              {skipped.map((t) => {
                const dest = targetById(t.socialTargetId);
                return (
                  <li key={t.id} className="flex items-center gap-2 text-xs text-muted">
                    <Pill tone={targetStatusTone[t.status]}>{humanStatus(t.status)}</Pill>
                    <span>{dest?.handle}</span>
                    <span className="text-subtle">— {t.error}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
