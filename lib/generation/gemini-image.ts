/**
 * Image generation, called directly against Gemini rather than via LiteLLM.
 *
 * Not for lack of trying the proxy first. Two things forced it:
 *
 *   - Imagen is unreachable on this project's key. `models.list` shows only
 *     Veo video models as `predict`-capable, so the `imagen-3.0-generate-002:predict`
 *     call this pipeline used to make could only ever 404.
 *   - Gemini's own image models answer on `generateContent` and return the
 *     bytes inline, which is not what the proxy's /v1/images/generations route
 *     targets.
 *
 * So the bytes come from here, and LiteLLM stays the path for text. If the
 * proxy grows a route for inline-image `generateContent`, this becomes a thin
 * shim over it and the activity above does not change.
 */

import { GenerationError } from "./litellm";
import type { AspectRatio } from "@/prompt/image-generator";

/** Verified against this project's key; both return inline bytes. */
export const IMAGE_MODELS = ["gemini-3-pro-image", "gemini-2.5-flash-image"] as const;

export type GeneratedImage = {
  bytes: Buffer;
  /** Whatever the model actually returned — it picks jpeg or png itself. */
  mime: string;
  model: string;
  /**
   * Token counts the provider reported, where it reports any.
   *
   * Gemini answers `generateContent` with `usageMetadata` even for an image,
   * and this was being discarded. Recorded because it is authoritative usage;
   * it does not price the call, which is billed per image.
   *
   * Null means the provider said nothing, which is not the same as zero.
   */
  inputTokens?: number | null;
  outputTokens?: number | null;
  /** The provider's own request id, when one comes back. */
  requestId?: string | null;
  /**
   * What the image was billed at, when the provider's request fixes it.
   *
   * Recorded on the usage event even though pricing is currently one flat rate
   * per image: real image pricing varies by size and quality, so capturing
   * them now means history can be repriced rather than lost.
   */
  width?: number | null;
  height?: number | null;
  quality?: string | null;
};

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

export type GenerateImageOptions = {
  prompt: string;
  negativePrompt?: string;
  aspectRatio?: AspectRatio;
  /** Required: there is no built-in image model to fall back to. */
  model: string;
  /**
   * The key stored on the `AiModel` row for this model.
   *
   * Required, and deliberately not defaulted to a deployment-wide
   * `GEMINI_API_KEY`: the key that pays for a call belongs to the row that
   * named the model, so a row with no key is a configuration gap to report
   * rather than someone else's bill to run up.
   */
  apiKey: string;
  signal?: AbortSignal;
};

export async function generateImage(opts: GenerateImageOptions): Promise<GeneratedImage> {
  const { apiKey, model } = opts;

  // The negative prompt is folded into the text: `generateContent` has no
  // separate field for it, unlike Imagen's predict body.
  const text = opts.negativePrompt
    ? `${opts.prompt}\n\nAvoid entirely: ${opts.negativePrompt}`
    : opts.prompt;

  const res = await fetch(`${GEMINI_BASE}/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text }] }],
      ...(opts.aspectRatio
        ? { generationConfig: { imageConfig: { aspectRatio: opts.aspectRatio } } }
        : {}),
    }),
    signal: opts.signal,
  });

  if (!res.ok) {
    const body = await res.text();
    let message = body.slice(0, 300);
    try {
      const parsed = JSON.parse(body);
      if (parsed?.error?.message) message = parsed.error.message;
    } catch {
      // Non-JSON body; the truncated text stands.
    }
    throw new GenerationError(message, res.status, model);
  }

  const data = await res.json();
  const parts: unknown[] = data?.candidates?.[0]?.content?.parts ?? [];

  // Responses interleave text and image parts, and the key is snake_case on
  // some versions and camelCase on others.
  for (const part of parts) {
    const blob = (part as { inlineData?: unknown; inline_data?: unknown }).inlineData
      ?? (part as { inline_data?: unknown }).inline_data;
    if (!blob) continue;

    const { data: b64, mimeType, mime_type } = blob as {
      data?: string;
      mimeType?: string;
      mime_type?: string;
    };
    if (!b64) continue;

    const meta = data?.usageMetadata;

    return {
      bytes: Buffer.from(b64, "base64"),
      mime: mimeType ?? mime_type ?? "image/png",
      model,
      inputTokens: typeof meta?.promptTokenCount === "number" ? meta.promptTokenCount : null,
      outputTokens: typeof meta?.candidatesTokenCount === "number" ? meta.candidatesTokenCount : null,
      requestId: typeof data?.responseId === "string" ? data.responseId : null,
    };
  }

  // A 200 carrying only text means the model answered in words instead of
  // drawing — usually a prompt it declined, or one it read as a question.
  const spoken = parts
    .map((p) => (p as { text?: string }).text)
    .filter((t): t is string => typeof t === "string")
    .join(" ")
    .slice(0, 200);

  throw new GenerationError(
    spoken
      ? `The model replied with text instead of an image: "${spoken}"`
      : "The model returned no image data.",
    200,
    model,
  );
}
