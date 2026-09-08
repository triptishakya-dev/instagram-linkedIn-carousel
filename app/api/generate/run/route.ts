import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ApiError, readJson, toErrorResponse } from "@/lib/http";
import { CONTENT_TASK_QUEUE, temporalClient } from "@/lib/temporal";
import { generateForGoalWorkflow } from "@/worker/workflows/generate-post";

const runSchema = z.object({
  /** Omitted means every active goal that has something to generate from. */
  goalIds: z.array(z.string().min(1)).optional(),
  /**
   * Renders this many slides instead of the configured count, for a one-off
   * run. A goal set to eight Instagram slides costs eight image calls.
   */
  slideCount: z.number().int().min(1).max(10).optional(),
});

/** `YYYY-MM-DD` in the workspace's own day, which is what the key means. */
function dateKey(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * The IANA zone out of the settings blob, which stores a label like
 * "Asia/Kolkata (IST)".
 */
function workspaceZone(settings: unknown): string {
  const raw = (settings as { timezone?: unknown } | null)?.timezone;
  const label = typeof raw === "string" ? raw.split(" ")[0] : "";
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: label });
    return label;
  } catch {
    return "UTC";
  }
}

/**
 * POST /api/generate/run — start a generation run now.
 *
 * There is deliberately no way to pass a topic, style or prompt here. Every
 * one of those comes from the goal row, so a run cannot produce a post that is
 * not traceable to stored configuration; the route that used to live at
 * `/api/worker/start` picked one of five hardcoded topics at random and
 * ignored the user's goals entirely.
 */
export async function POST(req: Request) {
  try {
    const userId = await getCurrentUserId();

    const body = runSchema.parse(
      await readJson(req).catch(() => ({})),
    );

    const goals = await prisma.goal.findMany({
      where: {
        userId,
        status: "ACTIVE",
        ...(body.goalIds?.length ? { id: { in: body.goalIds } } : {}),
      },
      select: { id: true, name: true, platforms: true, imagePrompt: true, captionPrompt: true },
      orderBy: { createdAt: "asc" },
    });

    if (goals.length === 0) {
      throw new ApiError(
        404,
        "NOT_FOUND",
        body.goalIds?.length
          ? "No active goal matched that id."
          : "There are no active goals to generate from.",
      );
    }

    // A goal with nothing written in it has no prompt to generate from. Saying
    // so beats producing a post from the goal's name and calling it a success.
    const unusable = goals.filter((g) => !g.imagePrompt?.trim() && !g.captionPrompt?.trim());
    if (unusable.length === goals.length) {
      throw new ApiError(
        422,
        "BAD_REQUEST",
        `${unusable.map((g) => g.name).join(", ")} ${unusable.length === 1 ? "has" : "have"} no image or caption prompt. ` +
          "Add one on the goal, then run again.",
      );
    }

    const workspace = await prisma.workspaceSetting.findUnique({
      where: { userId },
      select: { settings: true },
    });
    const key = dateKey(workspaceZone(workspace?.settings));

    const usable = goals.filter((g) => g.imagePrompt?.trim() || g.captionPrompt?.trim());

    const { client, close } = await temporalClient().catch(() => {
      throw new ApiError(
        503,
        "INTERNAL",
        "Cannot reach Temporal. Start it with `docker compose up -d temporal` and make sure the worker is running.",
      );
    });

    try {
      const started = [];

      for (const goal of usable) {
        const run = await prisma.generationRun.create({
          data: { userId, goalId: goal.id, trigger: "MANUAL", status: "QUEUED" },
          select: { id: true },
        });

        const handle = await client.workflow.start(generateForGoalWorkflow, {
          taskQueue: CONTENT_TASK_QUEUE,
          // Scoped to the run row, so a retried request starts a new run
          // rather than colliding with a workflow that is still going.
          workflowId: `generate-${run.id}`,
          args: [
            {
              userId,
              goalId: goal.id,
              runId: run.id,
              platforms: goal.platforms,
              dateKey: key,
              ...(body.slideCount ? { slideCountOverride: body.slideCount } : {}),
            },
          ],
        });

        started.push({
          runId: run.id,
          goalId: goal.id,
          goalName: goal.name,
          workflowId: handle.workflowId,
          platforms: goal.platforms,
        });
      }

      return NextResponse.json({ started, dateKey: key }, { status: 202 });
    } finally {
      await close();
    }
  } catch (err) {
    return toErrorResponse(err);
  }
}
