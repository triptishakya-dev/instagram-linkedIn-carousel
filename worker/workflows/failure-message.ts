/**
 * Turning a thrown failure into the sentence worth recording.
 *
 * Lives beside the workflow rather than in `lib/` because workflow code is
 * bundled separately and may not reach anything that touches Node APIs. It is
 * pure string work, so it bundles cleanly and is testable on its own.
 */

/** Messages Temporal wraps a failure in, which say nothing about the failure. */
const WRAPPER =
  /^(activity task failed|workflow execution (failed|error)|child workflow execution failed)\.?$/i;

/**
 * Message text from anything thrown, without assuming it is an Error.
 *
 * An activity that throws does not reach workflow code as the error it threw:
 * Temporal wraps it in an `ActivityFailure` whose own message is the fixed
 * string "Activity task failed", and the real complaint — a depleted quota, a
 * refused prompt, a missing key — hangs off the `cause` chain underneath.
 * Reading only the top message is what made every failed run recorded on
 * `GenerationRun.error` read "Slide 1 failed: Activity task failed" and
 * explain nothing to whoever went looking for the reason.
 *
 * So the chain is walked and the deepest message that is not one of Temporal's
 * own wrappers wins, because that is the one the provider actually sent.
 */
export function describeFailure(err: unknown): string {
  const seen = new Set<object>();
  let cur: unknown = err;
  let deepest = "";
  let top = "";

  while (cur && typeof cur === "object" && !seen.has(cur as object)) {
    seen.add(cur as object);
    const raw = (cur as { message?: unknown }).message;
    const msg = typeof raw === "string" ? raw.trim() : "";
    if (msg) {
      if (!top) top = msg;
      if (!WRAPPER.test(msg)) deepest = msg;
    }
    cur = (cur as { cause?: unknown }).cause;
  }

  return deepest || top || String(err);
}
