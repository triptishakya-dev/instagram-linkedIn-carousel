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
import type { AspectRatio } from "@/prompt/image-generator";

export type RenderImageOptions = {
  prompt: string;
  negativePrompt?: string;
  aspectRatio?: AspectRatio;
  /** Required: there is no built-in image model to fall back to. */
  model: string;
  /** The stored key from the model's row. Required; there is no shared default. */
  apiKey: string;
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
