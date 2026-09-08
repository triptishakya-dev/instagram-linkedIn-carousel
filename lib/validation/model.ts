import { z } from "zod";

/**
 * The model fields, stated once without defaults.
 *
 * Kept separate from the create-time defaults below because
 * `createModelSchema.partial()` is not a partial-update schema. `.partial()`
 * makes a key optional, but a `.default()` on that key still fires when the
 * key is absent -- so parsing `{ role: "SLIDES" }` yielded price 0, a 4000
 * token ceiling, temperature 0.7 and `enabled: true` alongside it, and the
 * route's `!== undefined` checks then wrote every one of them.
 *
 * That made a single-field PUT destructive, which is exactly how the UI edits:
 * `setVal` sends one key at a time, and `rotateModelKey` sends only `{ key }`.
 * Saving a provider key therefore reset the row's role to BOTH and blanked its
 * pricing. Update validates against these bare fields, so an omitted key stays
 * omitted and the route leaves the column alone.
 */
const modelFields = {
  label: z.string().trim().min(1, "Model label is required.").max(100),
  provider: z.string().trim().min(1, "Provider name is required.").max(100),
  apiModelId: z.string().trim().nullish(),
  role: z
    .enum(["CAPTION", "SLIDES", "BOTH", "caption", "slides", "both"])
    .transform((v) => v.toUpperCase() as "CAPTION" | "SLIDES" | "BOTH"),
  inputPricePerMTokInr: z.number().min(0),
  outputPricePerMTokInr: z.number().min(0),
  maxTokens: z.number().int().min(100).max(128000),
  temperature: z.number().min(0).max(1),
  enabled: z.boolean(),
  key: z.string().nullish(),
};

/** Creating a row fills in what the caller left out; there is no prior value. */
export const createModelSchema = z.object({
  ...modelFields,
  role: z
    .enum(["CAPTION", "SLIDES", "BOTH", "caption", "slides", "both"])
    .default("BOTH")
    .transform((v) => v.toUpperCase() as "CAPTION" | "SLIDES" | "BOTH"),
  inputPricePerMTokInr: z.number().min(0).default(0),
  outputPricePerMTokInr: z.number().min(0).default(0),
  maxTokens: z.number().int().min(100).max(128000).default(4000),
  temperature: z.number().min(0).max(1).default(0.7),
  enabled: z.boolean().default(true),
});

export type CreateModelInput = z.infer<typeof createModelSchema>;

/** Updating one names only what changes; everything else keeps its value. */
export const updateModelSchema = z.object(modelFields).partial();
export type UpdateModelInput = z.infer<typeof updateModelSchema>;
