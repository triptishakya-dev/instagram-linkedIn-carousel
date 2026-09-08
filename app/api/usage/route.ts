import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { toErrorResponse } from "@/lib/http";
import { getUsageReport } from "@/lib/usage/query";

/**
 * GET /api/usage — the canonical usage figures.
 *
 * Deliberately thin: every total is computed in `lib/usage/aggregate.ts`, and
 * this only parses the window and hands back the result. The five surfaces
 * that show usage all read this one response through the store, so they cannot
 * disagree the way they did when each summed posts for itself.
 *
 * `from`/`to` are ISO dates over `createdAt`, which is when generation
 * happened. Omit them for the all-time figure, which is returned alongside the
 * period either way.
 */
export async function GET(req: Request) {
  try {
    const userId = await getCurrentUserId();
    const url = new URL(req.url);

    // An unparseable date is ignored rather than 400'd: the window is a filter,
    // and falling back to all-time is more useful than refusing to answer.
    const parse = (key: string): Date | null => {
      const raw = url.searchParams.get(key);
      if (!raw) return null;
      const d = new Date(raw);
      return Number.isNaN(d.getTime()) ? null : d;
    };

    const report = await getUsageReport({
      userId,
      from: parse("from"),
      to: parse("to"),
      goalId: url.searchParams.get("goalId"),
      postId: url.searchParams.get("postId"),
    });

    return NextResponse.json(report);
  } catch (err) {
    return toErrorResponse(err);
  }
}
