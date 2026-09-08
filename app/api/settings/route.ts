import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getCurrentUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { readJson, toErrorResponse } from "@/lib/http";
import { saveSettingsSchema } from "@/lib/validation/settings";

/**
 * GET /api/settings
 * Workspace preferences. Absent until the user saves for the first time, in
 * which case the client keeps its own defaults — hence the nullable body
 * rather than seeding a row here.
 */
export async function GET() {
  try {
    const userId = await getCurrentUserId();
    const row = await prisma.workspaceSetting.findUnique({ where: { userId } });

    return NextResponse.json({
      settings: row?.settings ?? null,
      team: row?.team ?? [],
      budgetCap: row?.budgetCap ?? null,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/**
 * PUT /api/settings
 * Upserts the single row for this user.
 *
 * `settings` is merged into what is stored rather than replacing it, which is
 * what "omitted keys keep whatever is stored" was always meant to mean: the
 * column held one JSON blob, and writing it whole made the last client to save
 * anything win over every key in it. A tab that had loaded before another set
 * the default caption model would write its own stale empty value back over
 * it, and a preference the user had saved would quietly revert. Clients now
 * send only the keys they changed, and those are the only ones that move.
 */
export async function PUT(req: Request) {
  try {
    const userId = await getCurrentUserId();
    const body = saveSettingsSchema.parse(await readJson(req));

    const team = body.team as Prisma.InputJsonValue | undefined;

    const stored = body.settings
      ? (
          await prisma.workspaceSetting.findUnique({
            where: { userId },
            select: { settings: true },
          })
        )?.settings
      : undefined;

    const settings = body.settings
      ? ({
          ...(stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {}),
          ...body.settings,
        } as Prisma.InputJsonValue)
      : undefined;

    const row = await prisma.workspaceSetting.upsert({
      where: { userId },
      create: {
        userId,
        settings: settings ?? {},
        ...(team !== undefined ? { team } : {}),
        ...(body.budgetCap !== undefined ? { budgetCap: body.budgetCap } : {}),
      },
      update: {
        ...(settings !== undefined ? { settings } : {}),
        ...(team !== undefined ? { team } : {}),
        ...(body.budgetCap !== undefined ? { budgetCap: body.budgetCap } : {}),
      },
    });

    return NextResponse.json({
      settings: row.settings,
      team: row.team,
      budgetCap: row.budgetCap,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
