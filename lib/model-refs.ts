/**
 * Model ids referenced from places the database cannot police.
 *
 * `Goal.modelId` is a plain column and the workspace settings blob is opaque
 * JSON, so nothing cascades when an `AiModel` row goes away. Deleting a model
 * has to find and clear those references by hand, and this is the one list of
 * where they hide.
 */

/** Settings keys whose value is an `AiModel` id. */
export const MODEL_REF_SETTING_KEYS = ["defCaptionModel", "defSlideModel"] as const;

export type ModelRefSettingKey = (typeof MODEL_REF_SETTING_KEYS)[number];

export type ClearedSettings = {
  /** The blob to write back. */
  settings: Record<string, unknown>;
  /** Which keys were pointing at the model. Never empty. */
  cleared: ModelRefSettingKey[];
};

/**
 * Blanks any settings key naming `modelId`.
 *
 * Returns `null` when there is nothing to change — including for a blob that
 * is missing or not an object — so the caller can skip the write rather than
 * bump `updatedAt` on a row it did not touch. Cleared keys become `""` rather
 * than being removed, because that is what "no default chosen" already means
 * to the Settings view's `<select>`.
 *
 * An empty `modelId` matches nothing, since `""` is itself how an unset
 * default is stored — taking it as an id would "clear" every default that was
 * never set and report having done so.
 */
export function clearModelFromSettings(
  settings: unknown,
  modelId: string,
): ClearedSettings | null {
  if (!modelId) return null;
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return null;

  const blob = settings as Record<string, unknown>;
  const cleared = MODEL_REF_SETTING_KEYS.filter((k) => blob[k] === modelId);
  if (cleared.length === 0) return null;

  const next = { ...blob };
  for (const k of cleared) next[k] = "";

  return { settings: next, cleared };
}
