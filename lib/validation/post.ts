import { z } from "zod";
import { ALLOWED_IMAGE_MIME, MAX_UPLOAD_BYTES } from "../media";
import { isValidTimeZone } from "../tz";
import { promptField } from "./prompt";

/** Provider caption ceilings. Enforced per selected platform, not globally. */
export const IG_CAPTION_MAX = 2200;
export const LI_COMMENTARY_MAX = 3000;

/** Instagram carousels top out at 10 items. */
export const MAX_MEDIA_PER_POST = 10;

export const presignRequestSchema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.enum(ALLOWED_IMAGE_MIME),
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
});

export type PresignRequest = z.infer<typeof presignRequestSchema>;

export const createPostSchema = z.object({
  caption: z.string().trim().min(1, "Caption text field is required.").max(LI_COMMENTARY_MAX),
  captionPrompt: promptField("Caption prompt"),
  platforms: z
    .array(z.enum(["INSTAGRAM", "LINKEDIN"]))
    .min(1, "Pick at least one destination.")
    .transform((list) => [...new Set(list)]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date."),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Pick a time."),
  timezone: z.string().refine(isValidTimeZone, "Unknown time zone."),
  staleAfterMinutes: z.number().int().min(5).max(120).default(30),
  media: z
    .array(z.object({ key: z.string().min(1), order: z.number().int().min(0) }))
    .max(MAX_MEDIA_PER_POST)
    .default([]),
});

export type CreatePostInput = z.infer<typeof createPostSchema>;

export const updatePostSchema = z
  .object({
    caption: z.string().trim().min(1).max(LI_COMMENTARY_MAX),
    captionPrompt: promptField("Caption prompt"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().regex(/^\d{2}:\d{2}$/),
    timezone: z.string().refine(isValidTimeZone),
    staleAfterMinutes: z.number().int().min(5).max(120),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, "Nothing to update.")
  .refine(
    (body) => (body.date === undefined) === (body.time === undefined),
    "Date and time must be changed together.",
  );

export type Platform = "INSTAGRAM" | "LINKEDIN";

export type PlatformRuleViolation = { platform: Platform; message: string; field: string };

/**
 * The provider rules, checked server-side.
 *
 * The composer runs the same checks to disable its button, but that is a
 * convenience for the person typing — it is not a guarantee. A direct API call
 * has to fail here, not four hours later inside the publish worker.
 */
export function checkPlatformRules(input: {
  platforms: Platform[];
  caption: string;
  mediaCount: number;
}): PlatformRuleViolation[] {
  const violations: PlatformRuleViolation[] = [];

  if (input.platforms.includes("INSTAGRAM")) {
    if (input.mediaCount === 0) {
      violations.push({
        platform: "INSTAGRAM",
        field: "media",
        message: "Instagram requires at least one logo image.",
      });
    }
    if (input.caption.length > IG_CAPTION_MAX) {
      violations.push({
        platform: "INSTAGRAM",
        field: "caption",
        message: `Caption is over Instagram's ${IG_CAPTION_MAX} characters.`,
      });
    }
  }

  if (input.platforms.includes("LINKEDIN") && input.caption.length > LI_COMMENTARY_MAX) {
    violations.push({
      platform: "LINKEDIN",
      field: "caption",
      message: `Commentary is over LinkedIn's ${LI_COMMENTARY_MAX} characters.`,
    });
  }

  return violations;
}
