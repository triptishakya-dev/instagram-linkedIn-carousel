/**
 * Text generation, through the LiteLLM proxy.
 *
 * The proxy is the only thing that holds provider keys, so this module knows
 * about one base URL and one model name and nothing about who serves it. That
 * is what lets an `AiModel` row in Accounts choose the provider: whatever is
 * in `apiModelId` is passed straight through.
 */

export type ChatUsage = {
  inputTokens: number;
  outputTokens: number;
};

export type ChatResult = {
  text: string;
  usage: ChatUsage;
  /** What actually answered, which is not always what was asked for. */
  model: string;
};

export class GenerationError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly model?: string,
  ) {
    super(message);
    this.name = "GenerationError";
  }
}

function baseUrl(): string {
  return (process.env.LITELLM_BASE_URL ?? "http://localhost:4000").replace(/\/$/, "");
}

function masterKey(): string {
  return process.env.LITELLM_MASTER_KEY ?? "sk-local-dev";
}

/**
 * Pulls the human-readable half out of a LiteLLM error body.
 *
 * The proxy nests the provider's own error inside its own, so the useful
 * sentence — "no longer available to new users", "invalid api key" — is buried
 * a couple of levels down. A run's error column is worthless without it.
 */
export function describeProxyError(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body);
    const message =
      parsed?.error?.message ?? parsed?.message ?? parsed?.detail?.error?.message ?? null;
    if (typeof message === "string" && message.trim()) {
      // The provider's own JSON is often embedded as text inside that string.
      const inner = message.match(/"message":\s*"((?:[^"\\]|\\.)*)"/);
      if (inner?.[1]) return inner[1].replace(/\\n/g, " ").replace(/\\"/g, '"').trim();
      return message.trim();
    }
  } catch {
    // Not JSON; the raw body is the best available description.
  }
  return body.trim().slice(0, 300) || `Request failed (${status}).`;
}

export type ChatOptions = {
  model: string;
  system?: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
};

export async function chatCompletion(opts: ChatOptions): Promise<ChatResult> {
  const messages: { role: string; content: string }[] = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content: opts.user });

  const res = await fetch(`${baseUrl()}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${masterKey()}`,
    },
    body: JSON.stringify({
      model: opts.model,
      messages,
      ...(opts.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {}),
      ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
    }),
    signal: opts.signal,
  });

  if (!res.ok) {
    throw new GenerationError(describeProxyError(res.status, await res.text()), res.status, opts.model);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;

  if (typeof text !== "string" || !text.trim()) {
    // A 200 with no content is usually a truncation: the model spent its
    // budget on reasoning tokens and emitted nothing. Silently storing an
    // empty caption would look like a successful run.
    throw new GenerationError(
      "The model returned no text. It may have hit the token limit before writing anything.",
      200,
      opts.model,
    );
  }

  return {
    text: text.trim(),
    model: typeof data?.model === "string" ? data.model : opts.model,
    usage: {
      inputTokens: Number(data?.usage?.prompt_tokens ?? 0),
      outputTokens: Number(data?.usage?.completion_tokens ?? 0),
    },
  };
}

/** Which models the proxy can currently serve, by `model_name`. */
export async function listProxyModels(signal?: AbortSignal): Promise<string[]> {
  const res = await fetch(`${baseUrl()}/v1/models`, {
    headers: { authorization: `Bearer ${masterKey()}` },
    signal,
  });
  if (!res.ok) throw new GenerationError(describeProxyError(res.status, await res.text()), res.status);
  const data = await res.json();
  return Array.isArray(data?.data)
    ? data.data.map((m: { id?: unknown }) => String(m.id ?? "")).filter(Boolean)
    : [];
}

/**
 * Cost in rupees for one call, from the model's own configured rates.
 *
 * The rates live on the `AiModel` row the user filled in, so this is their
 * pricing rather than a table baked in here.
 */
export function estimateCostInr(
  usage: ChatUsage,
  rates: { inputPricePerMTokInr: number; outputPricePerMTokInr: number },
): number {
  const input = (usage.inputTokens / 1_000_000) * rates.inputPricePerMTokInr;
  const output = (usage.outputTokens / 1_000_000) * rates.outputPricePerMTokInr;
  // Two decimals: this is displayed as currency, and a float tail would show.
  return Math.round((input + output) * 100) / 100;
}
