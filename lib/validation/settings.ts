import { z } from "zod";

const teamMemberSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email("That does not look like an email address.").max(200),
  role: z.string().trim().min(1).max(40),
});

/**
 * The settings blob is stored as JSON, so the schema's job here is to keep it
 * bounded rather than to mirror every field the form grows. Anything the client
 * sends is kept, capped at a size that cannot be used to stuff the row.
 */
const settingsBlobSchema = z
  .record(z.string().max(64), z.unknown())
  .refine(
    (v) => JSON.stringify(v).length <= 64_000,
    "Settings payload is too large.",
  );

export const saveSettingsSchema = z
  .object({
    settings: settingsBlobSchema,
    team: z.array(teamMemberSchema).max(100),
    budgetCap: z.number().int().min(0).max(1_000_000_000),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, "Nothing to save.");

export type SaveSettingsInput = z.infer<typeof saveSettingsSchema>;
export type TeamMemberInput = z.infer<typeof teamMemberSchema>;
