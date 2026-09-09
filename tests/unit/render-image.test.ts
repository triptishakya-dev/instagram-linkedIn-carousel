import { afterEach, describe, expect, it, vi } from "vitest";
import { isGeminiImageModel, renderImage } from "@/lib/generation/render-image";
import type { ReferenceImage } from "@/lib/generation/reference-image";

describe("image provider routing", () => {
  it("routes the Gemini image models to the direct call", () => {
    expect(isGeminiImageModel("gemini-3-pro-image")).toBe(true);
    expect(isGeminiImageModel("gemini-2.5-flash-image")).toBe(true);
  });

  it("routes everything else through the proxy", () => {
    expect(isGeminiImageModel("gpt-image-1")).toBe(false);
    expect(isGeminiImageModel("gemini-flash-latest")).toBe(false);
  });
});

/* ------------------------------------------------- reference pass-through -- */

/**
 * These go through `renderImage` rather than the adapters directly, because the
 * defect being covered was a pass-through failure: every layer had a plausible
 * reason to be the one that dropped the picture.
 */

const PIXEL = Buffer.from("not-really-a-png");

function reference(over: Partial<ReferenceImage> = {}): ReferenceImage {
  return {
    assetId: "ast_1",
    storageKey: "assets/u1/ast_1.png",
    mime: "image/png",
    name: "Studio shot",
    sizeBytes: PIXEL.byteLength,
    role: "reference",
    bytes: PIXEL,
    ...over,
  };
}

const GEMINI_OK = {
  candidates: [
    {
      content: {
        parts: [{ inline_data: { data: PIXEL.toString("base64"), mime_type: "image/png" } }],
      },
    },
  ],
  usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 22 },
  responseId: "resp_1",
};

const OPENAI_OK = {
  data: [{ b64_json: PIXEL.toString("base64") }],
  usage: { input_tokens: 11, output_tokens: 22 },
  id: "img_1",
};

/** One captured `fetch` call: the URL and the init it was given. */
function mockFetch(payload: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), init });
      return { ok: true, status: 200, json: async () => payload } as unknown as Response;
    }),
  );

  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/** The `contents[0].parts` array Gemini was actually sent. */
function geminiParts(init: RequestInit): Record<string, unknown>[] {
  return JSON.parse(String(init.body)).contents[0].parts;
}

describe("Gemini reference images", () => {
  it("sends each reference inline, ahead of the text", async () => {
    const calls = mockFetch(GEMINI_OK);

    await renderImage({
      prompt: "A red bicycle",
      model: "gemini-3-pro-image",
      apiKey: "k",
      references: [reference(), reference({ assetId: "ast_2", mime: "image/jpeg" })],
    });

    const parts = geminiParts(calls[0].init);

    expect(parts).toHaveLength(3);
    // References first, then the instruction: look at these, now do this.
    expect(parts[0].inline_data).toEqual({
      mime_type: "image/png",
      data: PIXEL.toString("base64"),
    });
    expect((parts[1].inline_data as { mime_type: string }).mime_type).toBe("image/jpeg");
    expect(parts[2].text).toBe("A red bicycle");
  });

  it("sends one text part and nothing else when there is no reference", async () => {
    const calls = mockFetch(GEMINI_OK);

    await renderImage({ prompt: "A red bicycle", model: "gemini-3-pro-image", apiKey: "k" });

    // The regression that matters most: an ordinary generation must be the
    // request it always was.
    expect(geminiParts(calls[0].init)).toEqual([{ text: "A red bicycle" }]);
  });

  it("puts the standing rules in Gemini's own systemInstruction field", async () => {
    const calls = mockFetch(GEMINI_OK);

    await renderImage({
      prompt: "A red bicycle",
      model: "gemini-3-pro-image",
      apiKey: "k",
      systemRules: "RULE ONE",
    });

    const body = JSON.parse(String(calls[0].init.body));

    expect(body.systemInstruction).toEqual({ parts: [{ text: "RULE ONE" }] });
    // Kept out of `contents`, so the standing rules are not competing with this
    // request's instruction inside the same text.
    expect(geminiParts(calls[0].init)).toEqual([{ text: "A red bicycle" }]);
  });

  it("sends no systemInstruction when no rules are supplied", async () => {
    const calls = mockFetch(GEMINI_OK);

    await renderImage({ prompt: "A red bicycle", model: "gemini-3-pro-image", apiKey: "k" });

    expect(JSON.parse(String(calls[0].init.body))).not.toHaveProperty("systemInstruction");
  });

  it("still folds the negative prompt into the text part", async () => {
    const calls = mockFetch(GEMINI_OK);

    await renderImage({
      prompt: "A red bicycle",
      negativePrompt: "watermark",
      model: "gemini-3-pro-image",
      apiKey: "k",
      references: [reference()],
    });

    const parts = geminiParts(calls[0].init);

    expect(parts).toHaveLength(2);
    expect(parts[1].text).toContain("Avoid entirely: watermark");
  });
});

describe("OpenAI-compatible reference images", () => {
  it("switches to the edits route and attaches every reference as a file", async () => {
    const calls = mockFetch(OPENAI_OK);

    await renderImage({
      prompt: "A red bicycle",
      aspectRatio: "1:1",
      model: "gpt-image-1",
      apiKey: "k",
      references: [reference(), reference({ assetId: "ast_2" })],
    });

    expect(calls[0].url).toContain("/v1/images/edits");

    const body = calls[0].init.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.getAll("image")).toHaveLength(2);
    expect(body.get("prompt")).toBe("A red bicycle");
    expect(body.get("size")).toBe("1024x1024");

    // Never the `image[]` alias: LiteLLM leaks that key out of the parsed form
    // and forwards it to OpenAI as a non-file, which fails every slide with
    // "Invalid type for 'image[0]': expected a file, but got a string instead."
    expect(body.getAll("image[]")).toHaveLength(0);

    // Set by hand it would carry no multipart boundary, and the proxy could not
    // parse the body at all.
    expect(calls[0].init.headers).not.toHaveProperty("content-type");
  });

  it("names each file part with an extension the provider can read", async () => {
    const calls = mockFetch(OPENAI_OK);

    await renderImage({
      prompt: "A red bicycle",
      model: "gpt-image-1",
      apiKey: "k",
      references: [reference({ mime: "image/jpeg" })],
    });

    const part = (calls[0].init.body as FormData).get("image") as File;

    expect(part.name).toBe("reference-0.jpg");
    expect(part.type).toBe("image/jpeg");
  });

  it("keeps the JSON generations route when there is no reference", async () => {
    const calls = mockFetch(OPENAI_OK);

    await renderImage({
      prompt: "A red bicycle",
      aspectRatio: "4:5",
      model: "gpt-image-1",
      apiKey: "k",
    });

    expect(calls[0].url).toContain("/v1/images/generations");

    const body = JSON.parse(String(calls[0].init.body));
    expect(body).toMatchObject({
      model: "gpt-image-1",
      prompt: "A red bicycle",
      n: 1,
      size: "1024x1536",
      api_key: "k",
    });
  });

  it("prefixes the standing rules onto the prompt, its only text channel", async () => {
    const calls = mockFetch(OPENAI_OK);

    await renderImage({
      prompt: "A red bicycle",
      model: "gpt-image-1",
      apiKey: "k",
      systemRules: "RULE ONE",
    });

    const body = JSON.parse(String(calls[0].init.body));

    expect(body.prompt).toContain("RULE ONE");
    // The request's own instruction stays last, and there is no system field to
    // put the rules in -- the endpoint has none.
    expect(body.prompt.endsWith("A red bicycle")).toBe(true);
    expect(body).not.toHaveProperty("system");
  });

  it("prefixes them on the edits route too", async () => {
    const calls = mockFetch(OPENAI_OK);

    await renderImage({
      prompt: "A red bicycle",
      model: "gpt-image-1",
      apiKey: "k",
      references: [reference()],
      systemRules: "RULE ONE",
    });

    const body = calls[0].init.body as FormData;

    expect(calls[0].url).toContain("/v1/images/edits");
    expect(String(body.get("prompt"))).toContain("RULE ONE");
  });

  it("sends the prompt alone when no rules are supplied", async () => {
    const calls = mockFetch(OPENAI_OK);

    await renderImage({ prompt: "A red bicycle", model: "gpt-image-1", apiKey: "k" });

    expect(JSON.parse(String(calls[0].init.body)).prompt).toBe("A red bicycle");
  });

  it("explains an error against a model that cannot take image input", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 404,
        text: async () => JSON.stringify({ error: { message: "Not Found" } }),
      }) as unknown as Response),
    );

    await expect(
      renderImage({
        prompt: "A red bicycle",
        model: "dall-e-3",
        apiKey: "k",
        references: [reference()],
      }),
    ).rejects.toThrow(/1 reference image, which needs a model that accepts image input/);
  });
});
