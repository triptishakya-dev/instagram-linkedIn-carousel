import Link from "next/link";
import {
  fmtDateTime,
  fmtRelative,
  humanStatus,
  mediaShape,
  platformChip,
  postStatusTone,
  targetStatusTone,
} from "@/lib/format";
import { targetById } from "@/lib/app-data";
import type { Post, PublishTarget } from "@/lib/types";
import { MediaTile, Pill, PlatformMark } from "./ui";

export function TargetChip({ target }: { target: PublishTarget }) {
  const dest = targetById(target.socialTargetId);
  if (!dest) return null;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${platformChip[dest.platform]}`}
      >
        <PlatformMark platform={dest.platform} className="h-3 w-3" />
        {dest.handle}
      </span>
      <Pill tone={targetStatusTone[target.status]} dot>
        {humanStatus(target.status)}
      </Pill>
    </span>
  );
}

export function PostRow({ post }: { post: Post }) {
  const live = post.targets.filter((t) => t.status !== "SKIPPED");
  const platforms = [...new Set(live.map((t) => targetById(t.socialTargetId)?.platform))].filter(
    Boolean,
  );

  return (
    <Link
      href={`/posts/${post.id}`}
      className="flex gap-4 px-5 py-4 transition-colors hover:bg-surface-2"
    >
      <div className="w-14 shrink-0">
        {post.media[0] ? (
          <MediaTile media={post.media[0]} forcedAspect="1:1" noteCrop={false} />
        ) : (
          // Text-only is a valid LinkedIn post, so a row can have no media at all.
          <div className="aspect-square rounded-lg border border-dashed border-line-strong" />
        )}
        {post.media.length > 1 ? (
          <p className="mt-1 text-center font-mono text-[10px] text-subtle">
            +{post.media.length - 1}
          </p>
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={postStatusTone[post.status]} dot>
            {humanStatus(post.status)}
          </Pill>
          <span className="text-xs text-subtle">
            {fmtDateTime(post.scheduledAt, post.timezone)} · {fmtRelative(post.scheduledAt)}
          </span>
        </div>

        <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-fg">{post.caption}</p>

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {live.map((t) => (
            <TargetChip key={t.id} target={t} />
          ))}
        </div>

        <p className="mt-2 text-[11px] text-subtle">
          {platforms
            .map((p) => (p ? mediaShape(p, post.media.length) : ""))
            .filter(Boolean)
            .join("  ·  ")}
        </p>
      </div>
    </Link>
  );
}
