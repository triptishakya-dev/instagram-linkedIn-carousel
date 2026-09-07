import { z } from "zod";
import { ALLOWED_ASSET_MIME, MAX_ASSET_BYTES } from "../media";

/**
 * Presign for the asset library. Wider than `presignRequestSchema` in
 * `./post.ts`, which signs uploads destined for a published post and so only
 * admits what Instagram and LinkedIn will take.
 */
export const presignAssetSchema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.enum(ALLOWED_ASSET_MIME),
  sizeBytes: z.number().int().positive().max(MAX_ASSET_BYTES),
});

export type PresignAssetInput = z.infer<typeof presignAssetSchema>;

const assetKind = z
  .enum(["IMAGE", "LOGO", "VIDEO", "DOCUMENT", "image", "logo", "video", "document"])
  .transform((v) => v.toUpperCase() as "IMAGE" | "LOGO" | "VIDEO" | "DOCUMENT");

/**
 * Sent once the browser's PUT to the presigned URL has landed. The key is the
 * only thing tying the two calls together; everything else here is metadata
 * the server cannot cheaply derive, and the size and type are re-read from S3
 * rather than trusted.
 */
export const createAssetSchema = z.object({
  key: z.string().min(1, "Upload key is required."),
  name: z.string().trim().min(1, "File name is required.").max(255),
  kind: assetKind.optional(),
  /** Read off the decoded image in the browser; absent for video and PDFs. */
  width: z.number().int().positive().max(100000).nullish(),
  height: z.number().int().positive().max(100000).nullish(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
});

export type CreateAssetInput = z.infer<typeof createAssetSchema>;

export const updateAssetSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    kind: assetKind,
    tags: z.array(z.string().trim().min(1).max(40)).max(20),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, "Nothing to update.");

export type UpdateAssetInput = z.infer<typeof updateAssetSchema>;
