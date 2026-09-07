import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth";
import { readJson, toErrorResponse } from "@/lib/http";
import { PRESIGN_EXPIRY_SECONDS, buildTmpKey, presignAssetPut, presignPut } from "@/lib/s3";
import { presignAssetSchema } from "@/lib/validation/asset";
import { presignRequestSchema } from "@/lib/validation/post";

/**
 * Hands the browser a short-lived URL it can PUT the file straight to S3 with.
 *
 * The bytes never pass through this server: no payload ceiling, nothing to
 * buffer, and no cost for holding a 25 MB upload open. The declared size is
 * checked here to fail fast, but a presigned PUT cannot enforce it — the object
 * is re-measured with HeadObject when the post or asset row is created.
 *
 * `scope` picks which tier signs the URL. "post" is the strict one — images
 * only, 5 MB — because those bytes end up somewhere Instagram has to fetch
 * them. "asset" is the library, which also takes video and PDFs. It defaults
 * to "post" so existing callers keep the tighter rule.
 */
export async function POST(req: Request) {
  try {
    const userId = await getCurrentUserId();
    const raw = await readJson(req);
    const scope = (raw as { scope?: unknown })?.scope === "asset" ? "asset" : "post";

    if (scope === "asset") {
      const body = presignAssetSchema.parse(raw);
      const key = buildTmpKey(userId, body.contentType);
      const url = await presignAssetPut(key, body.contentType);

      return NextResponse.json({
        key,
        url,
        scope,
        expiresIn: PRESIGN_EXPIRY_SECONDS,
        contentType: body.contentType,
      });
    }

    const body = presignRequestSchema.parse(raw);
    const key = buildTmpKey(userId, body.contentType);
    const url = await presignPut(key, body.contentType);

    return NextResponse.json({
      key,
      url,
      scope,
      expiresIn: PRESIGN_EXPIRY_SECONDS,
      // The browser has to PUT with exactly this, or the signature will not match.
      contentType: body.contentType,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
