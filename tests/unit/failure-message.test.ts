import { describe, expect, it } from "vitest";
import { describeFailure } from "@/worker/workflows/failure-message";

/**
 * Shaped like what Temporal hands workflow code: an `ActivityFailure` whose own
 * message is fixed text, with the thrown error reconstructed on `cause`.
 */
function activityFailure(cause: unknown): Error {
  const err = new Error("Activity task failed");
  (err as Error & { cause?: unknown }).cause = cause;
  return err;
}

describe("describeFailure", () => {
  it("reports the provider's message from under the activity wrapper", () => {
    const err = activityFailure(
      new Error("Your prepayment credits are depleted."),
    );
    expect(describeFailure(err)).toBe("Your prepayment credits are depleted.");
  });

  it("reaches the deepest real message through nested wrappers", () => {
    const err = activityFailure(
      activityFailure(new Error("model gemini-3-pro-image does not exist")),
    );
    expect(describeFailure(err)).toBe("model gemini-3-pro-image does not exist");
  });

  it("keeps the wrapper text when there is nothing underneath it", () => {
    expect(describeFailure(new Error("Activity task failed"))).toBe(
      "Activity task failed",
    );
  });

  it("ignores blank messages on the chain", () => {
    expect(describeFailure(activityFailure(new Error("   ")))).toBe(
      "Activity task failed",
    );
  });

  it("survives a cause chain that points back at itself", () => {
    const err = new Error("Activity task failed") as Error & { cause?: unknown };
    err.cause = err;
    expect(describeFailure(err)).toBe("Activity task failed");
  });

  it("stringifies something thrown that is not an Error", () => {
    expect(describeFailure("rate limited")).toBe("rate limited");
    expect(describeFailure(undefined)).toBe("undefined");
  });
});
