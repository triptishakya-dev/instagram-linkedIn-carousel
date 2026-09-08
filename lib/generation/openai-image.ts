/**
 * Image generation through the LiteLLM proxy's OpenAI-compatible route.
 *
 * Separate from `gemini-image.ts` because the two are not the same shape:
 * Gemini returns image bytes inline from `generateContent` and is called
 * directly, while an OpenAI image model is reached at
 * `/v1/images/generations` and answers with base64 in a `data` array. The
 * proxy holds the provider key, or the model's own stored key overrides it the
 * same way it does for text.
 */

import { GenerationError, describeProxyError } from "./litellm";
import type { GeneratedImage } from "./gemini-image";
import type { AspectRatio } from "@/prompt/image-generator";

/**
 * The only sizes an OpenAI image model accepts, and what each aspect ratio
 * maps onto.
 *
 * This is a real compromise, not a formatting detail: Instagram's 4:5 has no
 * exact size here, so it renders at 2:3 — taller than the slot, and Instagram
 * will crop it. Gemini takes `aspectRatio` literally and is the better choice
 * where the ratio has to be exact.
 */
const SIZE_FOR: Record<AspectRatio, string> = {
  "1:1": "1024x1024",
  "4:5": "1024x1536",
  "9:16": "1024x1536",
  "1.91:1": "1536x1024",
  "16:9": "1536x1024",
};

/**
 * Sent explicitly rather than left to the provider's "auto".
 *
 * Auto can resolve to the top tier, and a carousel is eight images: at
 * gpt-image-1's rates that is the difference between roughly $0.32 and $1.50
 * for one post. "medium" is the deliberate middle, and the only reason this is
 * a constant rather than a setting is that nothing in the UI configures it
 * yet.
 */
const QUALITY = "medium";

export type OpenAiImageOptions = {
  prompt: string;
  negativePrompt?: string;
  aspectRatio?: AspectRatio;
  model: string;
  /** The stored key from the model's row, sent in place of the proxy's own. */
  apiKey: string;
  signal?: AbortSignal;
};

function baseUrl(): string {
  return (process.env.LITELLM_BASE_URL ?? "http://localhost:4000").replace(/\/$/, "");
}

export async function generateOpenAiImage(opts: OpenAiImageOptions): Promise<GeneratedImage> {
  // These models have no negative-prompt field, so it is folded into the text
  // the same way `gemini-image.ts` does it.
  const prompt = opts.negativePrompt
    ? `${opts.prompt}\n\nAvoid entirely: ${opts.negativePrompt}`
    : opts.prompt;

  const res = await fetch(`${baseUrl()}/v1/images/generations`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.LITELLM_MASTER_KEY ?? "sk-local-dev"}`,
    },
    body: JSON.stringify({
      model: opts.model,
      prompt,
      n: 1,
      quality: QUALITY,
      ...(opts.aspectRatio ? { size: SIZE_FOR[opts.aspectRatio] } : {}),
      api_key: opts.apiKey,
    }),
    signal: opts.signal,
  });

  if (!res.ok) {
    throw new GenerationError(
      describeProxyError(res.status, await res.text()),
      res.status,
      opts.model,
    );
  }

  const data = await res.json();
  const b64 = data?.data?.[0]?.b64_json;

  // A URL instead of bytes would expire before anybody looked at it, and the
  // pipeline stores the object itself. Better to fail than to record a link
  // that dies in an hour.
  if (typeof b64 !== "string" || !b64) {
    const url = data?.data?.[0]?.url;
    throw new GenerationError(
      url
        ? `${opts.model} returned a URL rather than image bytes, which cannot be stored.`
        : `${opts.model} returned no image.`,
      200,
      opts.model,
    );
  }

  // gpt-image models answer with a `usage` block; older image endpoints do
  // not. Recorded when present, never invented when absent -- and it does not
  // price the call, which is billed per image.
  const usage = data?.usage;
  const size = opts.aspectRatio ? SIZE_FOR[opts.aspectRatio] : null;
  const [w, h] = size ? size.split("x").map(Number) : [null, null];

  return {
    width: w,
    height: h,
    quality: QUALITY,
    bytes: Buffer.from(b64, "base64"),
    // These models return PNG unless asked otherwise, and the stored
    // extension comes from this rather than from the request.
    mime: typeof data?.output_format === "string" ? `image/${data.output_format}` : "image/png",
    model: typeof data?.model === "string" ? data.model : opts.model,
    inputTokens: typeof usage?.input_tokens === "number" ? usage.input_tokens : null,
    outputTokens: typeof usage?.output_tokens === "number" ? usage.output_tokens : null,
    requestId: typeof data?.id === "string" ? data.id : null,
  };
}
