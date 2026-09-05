import { z } from "zod";

export const createModelSchema = z.object({
  label: z.string().trim().min(1, "Model label is required.").max(100),
  provider: z.string().trim().min(1, "Provider name is required.").max(100),
  role: z
    .enum(["CAPTION", "SLIDES", "BOTH", "caption", "slides", "both"])
    .default("BOTH")
    .transform((v) => v.toUpperCase() as "CAPTION" | "SLIDES" | "BOTH"),
  inputPricePerMTokInr: z.number().min(0).default(0),
  outputPricePerMTokInr: z.number().min(0).default(0),
  maxTokens: z.number().int().min(100).max(128000).default(4000),
  temperature: z.number().min(0).max(1).default(0.7),
  enabled: z.boolean().default(true),
  key: z.string().nullish(),
});

export type CreateModelInput = z.infer<typeof createModelSchema>;

export const updateModelSchema = createModelSchema.partial();
export type UpdateModelInput = z.infer<typeof updateModelSchema>;
