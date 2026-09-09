/**
 * Image generation through the LiteLLM proxy's OpenAI-compatible routes.
 *
 * Separate from `gemini-image.ts` because the two are not the same shape:
 * Gemini returns image bytes inline from `generateContent` and is called
 * directly, while an OpenAI image model is reached at
 * `/v1/images/generations` and answers with base64 in a `data` array. The
 * proxy holds the provider key, or the model's own stored key overrides it the
 * same way it does for text.
 *
 * Two routes, not one, and which is used is decided by whether the caller
 * supplied reference images. `/v1/images/generations` takes JSON and cannot
 * carry a picture at all — there is no field for one — so a request with
 * references goes to `/v1/images/edits` as `multipart/form-data` instead. That
 * branch is the whole reason this file changed: encoding a reference into words
 * and posting it to the JSON route would look like it worked and would throw
 * the actual picture away.
 */

import { GenerationError, describeProxyError } from "./litellm";
import type { GeneratedImage } from "./gemini-image";
import type { ReferenceImage } from "./reference-image";
import { extensionForImageMime } from "./image-size";
import type { AspectRatio } from "@/prompt/image-generator";
import { withSystemRules } from "@/prompt/system-rules";

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
  /**
   * Pictures to hand the model as image inputs.
   *
   * Non-empty routes the call to `/v1/images/edits`, which is the only
   * OpenAI-compatible image route that accepts one.
   */
  references?: readonly ReferenceImage[];
  /**
   * Standing rules. Prefixed onto the prompt, because neither
   * `/v1/images/generations` nor `/v1/images/edits` has a system or role
   * concept -- `prompt` is the only text field either of them takes.
   */
  systemRules?: string;
  signal?: AbortSignal;
};

function baseUrl(): string {
  return (process.env.LITELLM_BASE_URL ?? "http://localhost:4000").replace(/\/$/, "");
}

function masterKey(): string {
  return process.env.LITELLM_MASTER_KEY ?? "sk-local-dev";
}

/**
 * Text-only generation: the original path, unchanged.
 *
 * Every request without references still takes exactly this route with exactly
 * this body, which is what keeps a change to reference handling from being a
 * change to everything else.
 */
async function postGeneration(
  opts: OpenAiImageOptions,
  prompt: string,
  size: string | null,
): Promise<Response> {
  return fetch(`${baseUrl()}/v1/images/generations`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${masterKey()}`,
    },
    body: JSON.stringify({
      model: opts.model,
      prompt,
      n: 1,
      quality: QUALITY,
      ...(size ? { size } : {}),
      api_key: opts.apiKey,
    }),
    signal: opts.signal,
  });
}

/**
 * Generation with reference images, as multipart form data.
 *
 * `/v1/images/edits` is the OpenAI-compatible route that takes pictures, and it
 * takes them as file parts rather than JSON — which is why this cannot be one
 * more field on the body above. Several references go on as repeated `image`
 * parts, which the model treats as references for one new image, so the response
 * shape is identical to the JSON route's and the caller below parses both the
 * same way.
 *
 * The field is `image`, NOT the `image[]` alias, and that is load-bearing when
 * the call goes through LiteLLM. The proxy reads the whole multipart body into a
 * dict (`dict(form_data)` in `common_utils/http_parsing_utils.py`) and then sets
 * `data["image"]` from the parsed uploads. Sent as `image`, that overwrite
 * replaces the raw form value and nothing stale is left. Sent as `image[]`, the
 * raw `image[]` key survives in the dict, is not covered by the proxy's own
 * "must be a file, not a string" guard, and is forwarded to OpenAI alongside the
 * real files — which answers
 *
 *     Invalid type for 'image[0]': expected a file, but got a string instead.
 *
 * and fails every slide. The proxy's own docs example uses `image[]`, so this is
 * a bug there rather than a rule; the plain name works on both paths, so there
 * is no reason to send the alias even once the proxy is fixed.
 *
 * The content-type header is deliberately not set: `fetch` derives it from the
 * `FormData` body along with the multipart boundary, and setting it by hand
 * produces a boundary-less header the proxy cannot parse.
 *
 * A filename with a real extension is attached to every part because the
 * provider infers the image type from it, not from the part's content type.
 */
async function postEdit(
  opts: OpenAiImageOptions,
  prompt: string,
  size: string | null,
  references: readonly ReferenceImage[],
): Promise<Response> {
  const form = new FormData();
  form.append("model", opts.model);
  form.append("prompt", prompt);
  form.append("n", "1");
  form.append("quality", QUALITY);
  if (size) form.append("size", size);
  // The same per-model key override the JSON route sends. A proxy build that
  // ignores it on a multipart route falls back to its own configured key, which
  // is the documented default rather than a failure.
  form.append("api_key", opts.apiKey);

  references.forEach((ref, i) => {
    form.append(
      "image",
      new Blob([new Uint8Array(ref.bytes)], { type: ref.mime }),
      `reference-${i}.${extensionForImageMime(ref.mime)}`,
    );
  });

  return fetch(`${baseUrl()}/v1/images/edits`, {
    method: "POST",
    headers: { authorization: `Bearer ${masterKey()}` },
    body: form,
    signal: opts.signal,
  });
}

export async function generateOpenAiImage(opts: OpenAiImageOptions): Promise<GeneratedImage> {
  // These models have no negative-prompt field, so it is folded into the text
  // the same way `gemini-image.ts` does it.
  const instruction = opts.negativePrompt
    ? `${opts.prompt}\n\nAvoid entirely: ${opts.negativePrompt}`
    : opts.prompt;

  // The standing rules go in front of it, labelled and separated. There is no
  // system channel on either image route, so this is not a lesser path — it is
  // the only one, and the text is identical to what Gemini gets in its own
  // field. Well within gpt-image-1's 32,000-character prompt ceiling.
  const prompt = withSystemRules(instruction, opts.systemRules);

  const size = opts.aspectRatio ? SIZE_FOR[opts.aspectRatio] : null;
  const references = opts.references ?? [];

  const res =
    references.length > 0
      ? await postEdit(opts, prompt, size, references)
      : await postGeneration(opts, prompt, size);

  if (!res.ok) {
    const described = describeProxyError(res.status, await res.text());

    // Only gpt-image-class models serve `/v1/images/edits`: dall-e-3 has no
    // edits route at all, and dall-e-2's wants a mask and a square PNG. Saying
    // so here stops a proxy 404 from being read as a broken deployment when the
    // real answer is to pick a different model in Accounts.
    const plural = references.length === 1 ? "" : "s";

    throw new GenerationError(
      references.length > 0
        ? `${described} (This request carried ${references.length} reference image${plural}, which needs a model that accepts image input: gpt-image-1, or a Gemini image model.)`
        : described,
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
