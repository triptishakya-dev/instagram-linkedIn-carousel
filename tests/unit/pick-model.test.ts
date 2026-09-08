import { describe, expect, it } from "vitest";
import { pickTextModel, type ModelRow } from "@/lib/generation/pick-model";
import { describeProxyError, estimateCostInr } from "@/lib/generation/litellm";

const row = (over: Partial<ModelRow> = {}): ModelRow => ({
  id: "mdl_1",
  label: "Claude Sonnet",
  apiModelId: "claude-sonnet-4-5",
  enabled: true,
  inputPricePerMTokInr: 268,
  outputPricePerMTokInr: 1340,
  ...over,
});

describe("pickTextModel", () => {
  it("uses the goal's model when it is callable", () => {
    const choice = pickTextModel({ goalModel: row(), workspaceModel: null });

    expect(choice.apiModelId).toBe("claude-sonnet-4-5");
    expect(choice.modelRowId).toBe("mdl_1");
    expect(choice.rates.inputPricePerMTokInr).toBe(268);
    expect(choice.fallbackReason).toBeNull();
  });

  it("names whatever model the row asks for, without a second opinion", () => {
    // The database is the authority on which models exist; the proxy routes
    // what it is given, using the key sent with the request.
    const choice = pickTextModel({
      goalModel: row({ apiModelId: "gpt-5-nano" }),
      workspaceModel: null,
    });
    expect(choice.apiModelId).toBe("gpt-5-nano");
  });

  it("uses the workspace default when the goal names no model", () => {
    const choice = pickTextModel({
      goalModel: null,
      workspaceModel: row({ id: "mdl_ws", label: "Workspace GPT", apiModelId: "gpt-5-nano" }),
    });

    expect(choice.apiModelId).toBe("gpt-5-nano");
    expect(choice.modelRowId).toBe("mdl_ws");
    expect(choice.fallbackReason).toBeNull();
  });

  it("falls through to the workspace default and reports the substitution", () => {
    const choice = pickTextModel({
      goalModel: row({ label: "Broken", apiModelId: null }),
      workspaceModel: row({ id: "mdl_ws", label: "Workspace GPT", apiModelId: "gpt-5-nano" }),
    });

    expect(choice.modelRowId).toBe("mdl_ws");
    // Using something other than the goal's own model is a substitution.
    expect(choice.fallbackReason).toContain("Broken");
  });

  // No built-in model answers for a workspace that configured none: spending
  // someone's money on a provider they did not choose is worse than failing.
  it("refuses rather than falling back when nothing is configured", () => {
    expect(() => pickTextModel({ goalModel: null, workspaceModel: null })).toThrow(
      /No caption model is configured/,
    );
  });

  it("refuses and explains when the only model has no API model id", () => {
    expect(() =>
      pickTextModel({
        goalModel: row({ label: "GPT - ChatGPT", apiModelId: null }),
        workspaceModel: null,
      }),
    ).toThrow(/GPT - ChatGPT[\s\S]*no API model id/);
  });

  it("refuses a disabled model", () => {
    expect(() => pickTextModel({ goalModel: row({ enabled: false }), workspaceModel: null })).toThrow(
      /is disabled/,
    );
  });

  it("refuses a slides-only model for captions", () => {
    expect(() =>
      pickTextModel({ goalModel: row({ role: "SLIDES" }), workspaceModel: null }),
    ).toThrow(/slides only/);
  });

  /**
   * Adding a model in Accounts writes an `AiModel` row; choosing a default
   * writes a settings key. They are separate screens, so a first run normally
   * has the row and not the key -- and used to fail claiming no model existed.
   */
  it("uses the only eligible configured model when no default names one", () => {
    const choice = pickTextModel({
      goalModel: null,
      workspaceModel: null,
      available: [row({ id: "mdl_only", label: "Sonnet", role: "BOTH" })],
    });

    expect(choice.modelRowId).toBe("mdl_only");
    expect(choice.fallbackReason).toMatch(/No default caption model is set/);
  });

  it("ignores ineligible rows when searching", () => {
    const choice = pickTextModel({
      goalModel: null,
      workspaceModel: null,
      available: [
        row({ id: "off", label: "Disabled", enabled: false }),
        row({ id: "img", label: "Image only", role: "SLIDES" }),
        row({ id: "bare", label: "No id", apiModelId: null }),
        row({ id: "good", label: "Usable", apiModelId: "claude-sonnet-4-5" }),
      ],
    });

    expect(choice.modelRowId).toBe("good");
  });

  // Which model gets billed is the user's decision, not a coin flip.
  it("asks rather than guessing when several rows could serve", () => {
    expect(() =>
      pickTextModel({
        goalModel: null,
        workspaceModel: null,
        available: [row({ id: "a", label: "Sonnet" }), row({ id: "b", label: "Haiku" })],
      }),
    ).toThrow(/Sonnet - claude-sonnet-4-5, Haiku - claude-sonnet-4-5[\s\S]*Set the caption default/);
  });

  // Two rows can carry the same label, so the label alone cannot identify
  // which one to go and pick. The api model id is what distinguishes them.
  it("distinguishes same-labelled rows by api model id", () => {
    expect(() =>
      pickTextModel({
        goalModel: null,
        workspaceModel: null,
        available: [
          row({ id: "a", label: "gpt", apiModelId: "gpt-image-2" }),
          row({ id: "b", label: "gpt", apiModelId: "gpt-4.1-mini" }),
        ],
      }),
    ).toThrow(/gpt - gpt-image-2, gpt - gpt-4\.1-mini/);
  });

  it("still refuses when every configured row is unusable", () => {
    expect(() =>
      pickTextModel({
        goalModel: null,
        workspaceModel: null,
        available: [row({ enabled: false })],
      }),
    ).toThrow(/No caption model is configured/);
  });

  it("keeps the named model's rejection in the message when the search also fails", () => {
    expect(() =>
      pickTextModel({
        goalModel: row({ label: "Broken", apiModelId: null }),
        workspaceModel: null,
        available: [row({ label: "Broken", apiModelId: null })],
      }),
    ).toThrow(/Broken[\s\S]*no API model id/);
  });
});

describe("estimateCostInr", () => {
  it("prices a call from the row's own rates", () => {
    const cost = estimateCostInr(
      { inputTokens: 1_000_000, outputTokens: 500_000 },
      { inputPricePerMTokInr: 268, outputPricePerMTokInr: 1340 },
    );
    expect(cost).toBe(938);
  });

  it("rounds to paise so currency does not render a float tail", () => {
    const cost = estimateCostInr(
      { inputTokens: 1234, outputTokens: 567 },
      { inputPricePerMTokInr: 268, outputPricePerMTokInr: 1340 },
    );
    expect(cost).toBe(1.09);
  });

  it("is zero for zero rates", () => {
    expect(
      estimateCostInr({ inputTokens: 9999, outputTokens: 9999 }, { inputPricePerMTokInr: 0, outputPricePerMTokInr: 0 }),
    ).toBe(0);
  });
});

describe("describeProxyError", () => {
  // The sentence that matters is nested inside the proxy's own error string;
  // without unwrapping it a run's error column reads "Request failed (404)".
  it("digs the provider's sentence out of a nested LiteLLM error", () => {
    const body = JSON.stringify({
      error: {
        message:
          'litellm.NotFoundError: GeminiException - {\n "error": {\n "code": 404,\n "message": "This model models/gemini-2.5-flash is no longer available to new users.",\n "status": "NOT_FOUND"\n }\n}',
      },
    });
    expect(describeProxyError(404, body)).toBe(
      "This model models/gemini-2.5-flash is no longer available to new users.",
    );
  });

  it("uses the outer message when there is no nested one", () => {
    expect(describeProxyError(401, JSON.stringify({ error: { message: "invalid api key" } }))).toBe(
      "invalid api key",
    );
  });

  it("falls back to the raw body, then to the status", () => {
    expect(describeProxyError(502, "upstream boom")).toBe("upstream boom");
    expect(describeProxyError(500, "")).toBe("Request failed (500).");
  });
});
