/**
 * One entry point for rendering a slide, whichever provider serves the model.
 *
 * The slide pipeline should not know which provider a model belongs to — that
 * is exactly what naming a model on an `AiModel` row is supposed to decide.
 * Gemini image models are called directly for their inline bytes; everything
 * else goes through the proxy's OpenAI-compatible image route.
 */

import { IMAGE_MODELS, generateImage, type GeneratedImage } from "./gemini-image";
import { generateOpenAiImage } from "./openai-image";
import type { ReferenceImage } from "./reference-image";
import type { AspectRatio } from "@/prompt/image-generator";

export type RenderImageOptions = {
  prompt: string;
  negativePrompt?: string;
  aspectRatio?: AspectRatio;
  /** Required: there is no built-in image model to fall back to. */
  model: string;
  /** The stored key from the model's row. Required; there is no shared default. */
  apiKey: string;
  /**
   * Pictures the model is to use as visual references, alongside the prompt.
   *
   * Passed through to whichever adapter answers, because a reference image is
   * not a provider detail: the slide pipeline decides that a goal's assets are
   * references, and both providers can take them — Gemini inline on
   * `generateContent`, OpenAI as file parts on `/v1/images/edits`. Absent or
   * empty leaves both adapters on the text-only request they always made.
   */
  references?: readonly ReferenceImage[];
  /**
   * The standing rules for every image request, from `prompt/system-rules.ts`.
   *
   * Supplied by the pipeline rather than read from the module here, so the
   * ruleset a run used is fixed in its plan instead of being whatever the
   * deployed constant says by the time a retry lands.
   *
   * How it is delivered is the adapter's business, and the two providers differ:
   * Gemini has a real `systemInstruction` field, OpenAI's image routes have no
   * roles at all. Same text either way. Absent leaves both on the request they
   * made before this existed.
   */
  systemRules?: string;
  signal?: AbortSignal;
};

/** True for a model this process calls Google directly for. */
export function isGeminiImageModel(model: string): boolean {
  return (IMAGE_MODELS as readonly string[]).includes(model);
}

export async function renderImage(opts: RenderImageOptions): Promise<GeneratedImage> {
  if (isGeminiImageModel(opts.model)) {
    return generateImage(opts);
  }

  return generateOpenAiImage(opts);
}
