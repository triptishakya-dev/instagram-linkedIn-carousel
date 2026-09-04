import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { readJson, toErrorResponse } from "@/lib/http";
import { PRESIGN_EXPIRY_SECONDS, buildTmpKey, presignPut } from "@/lib/s3";
import { presignRequestSchema } from "@/lib/validation/post";

/**
 * Hands the browser a short-lived URL it can PUT the file straight to S3 with.
 *
 * The bytes never pass through this server: no payload ceiling, nothing to
 * buffer, and no cost for holding a 5 MB upload open. The declared size is
 * checked here to fail fast, but a presigned PUT cannot enforce it — the object
 * is re-measured with HeadObject when the post attaches it.
 */
export async function POST(req: Request) {
  try {
    const userId = await getCurrentUserId();
    const body = presignRequestSchema.parse(await readJson(req));

    const key = buildTmpKey(userId, body.contentType);
    const url = await presignPut(key, body.contentType);

    return NextResponse.json({
      key,
      url,
      expiresIn: PRESIGN_EXPIRY_SECONDS,
      // The browser has to PUT with exactly this, or the signature will not match.
      contentType: body.contentType,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
