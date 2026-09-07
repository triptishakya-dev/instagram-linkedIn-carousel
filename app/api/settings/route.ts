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
 * Upserts the single row for this user. Partial: the Settings view saves one
 * section at a time, so omitted keys keep whatever is stored.
 */
export async function PUT(req: Request) {
  try {
    const userId = await getCurrentUserId();
    const body = saveSettingsSchema.parse(await readJson(req));

    const settings = body.settings as Prisma.InputJsonValue | undefined;
    const team = body.team as Prisma.InputJsonValue | undefined;

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
