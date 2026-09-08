import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chatCompletion } from "@/lib/generation/litellm";

const OK = {
  choices: [{ message: { content: "a caption" } }],
  usage: { prompt_tokens: 10, completion_tokens: 4 },
  model: "gpt-4o",
};

function stubFetch() {
  const fetchMock = vi.fn(
    async (_url: string, _init: RequestInit) =>
      new Response(JSON.stringify(OK), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** The single request the stub recorded, so a missing call fails loudly. */
function sentRequest(fetchMock: ReturnType<typeof stubFetch>): RequestInit {
  const call = fetchMock.mock.calls[0];
  if (!call) throw new Error("chatCompletion made no request");
  return call[1];
}

function sentBody(fetchMock: ReturnType<typeof stubFetch>) {
  return JSON.parse(String(sentRequest(fetchMock).body));
}

describe("chatCompletion key passthrough", () => {
  beforeEach(() => {
    process.env.LITELLM_BASE_URL = "http://proxy.test";
    process.env.LITELLM_MASTER_KEY = "sk-master";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the model's own key as api_key, which the proxy uses in place of its own", async () => {
    const fetchMock = stubFetch();
    await chatCompletion({ model: "gpt-4o", user: "hi", apiKey: "sk-row-key" });
    expect(sentBody(fetchMock).api_key).toBe("sk-row-key");
  });

  it("omits api_key entirely when the row has none, so the proxy's key answers", async () => {
    const fetchMock = stubFetch();
    await chatCompletion({ model: "gpt-4o", user: "hi" });
    expect("api_key" in sentBody(fetchMock)).toBe(false);
  });

  it("still authenticates to the proxy with the master key", async () => {
    const fetchMock = stubFetch();
    await chatCompletion({ model: "gpt-4o", user: "hi", apiKey: "sk-row-key" });
    const headers = sentRequest(fetchMock).headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer sk-master");
  });

  it("does not put the key anywhere else in the payload", async () => {
    const fetchMock = stubFetch();
    await chatCompletion({ model: "gpt-4o", system: "s", user: "u", apiKey: "sk-row-key" });
    const body = sentBody(fetchMock);
    expect(JSON.stringify(body.messages)).not.toContain("sk-row-key");
  });
});
