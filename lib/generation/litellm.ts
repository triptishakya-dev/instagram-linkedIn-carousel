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
  /**
   * Prompt tokens served from the provider's cache, when it says so.
   *
   * Reported inside `usage.prompt_tokens_details` and already counted within
   * `prompt_tokens`, so this is a breakdown rather than an addition. Null when
   * the provider does not report it, which most do not.
   */
  cachedInputTokens: number | null;
};

export type ChatResult = {
  text: string;
  usage: ChatUsage;
  /** What actually answered, which is not always what was asked for. */
  model: string;
  /**
   * The provider's own id for this request, for reconciling a ledger row
   * against the provider's bill. Null when none came back.
   */
  requestId: string | null;
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
  /**
   * The provider key for this model, when the `AiModel` row carries its own.
   *
   * The proxy honours an `api_key` in the request body and uses it in place of
   * the one from its config, so a workspace that stored its own key bills to
   * its own account. Omitted means the proxy's environment key answers, which
   * is the shared default.
   */
  apiKey?: string;
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
      // Overrides the proxy's own key for this one call. Verified against the
      // running proxy: a wrong key here fails the call rather than being
      // ignored, which is the whole point of storing one per model.
      ...(opts.apiKey ? { api_key: opts.apiKey } : {}),
    }),
    signal: opts.signal,
  });

  if (!res.ok) {
    throw new GenerationError(describeProxyError(res.status, await res.text()), res.status, opts.model);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;

  if (typeof text !== "string" || !text.trim()) {
    // A 200 with no content is nearly always a reasoning model spending its
    // whole budget before writing a word, so the budget is named: without it
    // the message sends you looking at the prompt instead of at Max tokens.
    const budget = opts.maxTokens;
    throw new GenerationError(
      `${opts.model} returned no text` +
        (budget
          ? `, having used its ${budget}-token budget. A reasoning model spends that budget ` +
            "thinking before it writes, so raise Max tokens on this model in Accounts."
          : ". It may have hit the token limit before writing anything."),
      200,
      opts.model,
    );
  }

  const cached = data?.usage?.prompt_tokens_details?.cached_tokens;

  return {
    text: text.trim(),
    model: typeof data?.model === "string" ? data.model : opts.model,
    requestId: typeof data?.id === "string" ? data.id : null,
    usage: {
      inputTokens: Number(data?.usage?.prompt_tokens ?? 0),
      outputTokens: Number(data?.usage?.completion_tokens ?? 0),
      cachedInputTokens: typeof cached === "number" ? cached : null,
    },
  };
}

/**
 * Cost in rupees for one call, from the model's own configured rates.
 *
 * The rates live on the `AiModel` row the user filled in, so this is their
 * pricing rather than a table baked in here.
 */
export function estimateCostInr(
  // Only the two billed counts, not the whole `ChatUsage`: this does not read
  // the cache breakdown, and demanding it would force every caller to supply a
  // field it has no use for.
  usage: { inputTokens: number; outputTokens: number },
  rates: { inputPricePerMTokInr: number; outputPricePerMTokInr: number },
): number {
  const input = (usage.inputTokens / 1_000_000) * rates.inputPricePerMTokInr;
  const output = (usage.outputTokens / 1_000_000) * rates.outputPricePerMTokInr;
  // Two decimals: this is displayed as currency, and a float tail would show.
  return Math.round((input + output) * 100) / 100;
}
