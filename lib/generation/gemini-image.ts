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

export const DEFAULT_IMAGE_MODEL: string = IMAGE_MODELS[0];

export type GeneratedImage = {
  bytes: Buffer;
  /** Whatever the model actually returned — it picks jpeg or png itself. */
  mime: string;
  model: string;
};

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

export type GenerateImageOptions = {
  prompt: string;
  negativePrompt?: string;
  aspectRatio?: AspectRatio;
  model?: string;
  signal?: AbortSignal;
};

export async function generateImage(opts: GenerateImageOptions): Promise<GeneratedImage> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new GenerationError("GEMINI_API_KEY is not set, so no image can be generated.");
  }

  const model = opts.model ?? DEFAULT_IMAGE_MODEL;

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

    return {
      bytes: Buffer.from(b64, "base64"),
      mime: mimeType ?? mime_type ?? "image/png",
      model,
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
