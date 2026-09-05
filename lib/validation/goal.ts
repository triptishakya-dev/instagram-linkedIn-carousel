import { z } from "zod";

export const goalScheduleSchema = z.object({
  cadence: z
    .enum(["DAILY", "ALTERNATE", "WEEKLY", "MONTHLY", "daily", "alternate", "weekly", "monthly"])
    .transform((v) => v.toUpperCase() as "DAILY" | "ALTERNATE" | "WEEKLY" | "MONTHLY"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Pick a valid time format (HH:MM)."),
  weekdays: z.array(z.number().int().min(0).max(6)).default([]),
  monthDay: z.number().int().min(1).max(31).default(1),
});

export type GoalScheduleInput = z.infer<typeof goalScheduleSchema>;

export const createGoalSchema = z.object({
  name: z.string().trim().min(1, "Goal name is required.").max(120),
  platforms: z
    .array(z.enum(["INSTAGRAM", "LINKEDIN", "instagram", "linkedin"]))
    .min(1, "Pick at least one platform.")
    .transform((list) => [...new Set(list.map((p) => p.toUpperCase() as "INSTAGRAM" | "LINKEDIN"))]),
  brandLogoAssetId: z.string().nullish(),
  logoKey: z.string().nullish(), // S3 tmp/ key if a new logo was uploaded
  captionPrompt: z.string().max(4000).nullish(),
  imagePrompt: z.string().max(4000).nullish(),
  startDate: z.string().min(1, "Start date is required."),
  endDate: z.string().nullish(),
  schedule: goalScheduleSchema,
  referenceAssetIds: z.array(z.string()).default([]),
  imageAssetIds: z.array(z.string()).default([]),
  modelId: z.string().nullish(),
  status: z
    .enum(["ACTIVE", "PAUSED", "ENDED", "active", "paused", "ended"])
    .default("ACTIVE")
    .transform((v) => v.toUpperCase() as "ACTIVE" | "PAUSED" | "ENDED"),
});

export type CreateGoalInput = z.infer<typeof createGoalSchema>;

export const updateGoalSchema = createGoalSchema.partial();
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;
