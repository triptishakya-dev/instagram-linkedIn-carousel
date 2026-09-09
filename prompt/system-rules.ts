/**
 * The standing rules every image request carries, whatever the goal says.
 *
 * Separate from `image-generator.ts` on purpose. That module composes what an
 * image should *look* like — style presets, palettes, camera, lighting — and
 * every line of it is aesthetic. These rules are about obedience: which input
 * wins when two of them disagree, what an attached asset obliges the model to
 * do, and what it may not quietly drop. Mixing the two is how the module ended
 * up exporting a `SYSTEM_IMAGE_PROMPT` that nothing ever imported.
 *
 * The rules are one string with two delivery mechanisms, because the providers
 * disagree about whether system prompts exist at all: Gemini's `generateContent`
 * takes a real `systemInstruction` field, while OpenAI's image routes have no
 * roles and only a `prompt`. Each adapter delivers this text the only way its
 * endpoint allows; the text itself does not change between them.
 *
 * They are also the single place the precedence ladder is stated. It used to be
 * repeated inside the reference-image guidance, and two near-identical ladders
 * in one request is how a model ends up splitting the difference between them.
 */

/**
 * Names the ruleset a run was generated under.
 *
 * Recorded on the plan and reported on the run, so a picture generated last
 * month can be read against the rules in force then rather than against
 * whatever this constant says today. Bumped whenever the text below changes in
 * a way that would change an output.
 */
export const SYSTEM_RULES_VERSION = "v1";

/**
 * Written as imperatives rather than prose because a model follows the former
 * and interprets the latter. Numbered so a failure can be reported against a
 * rule — "rule 7: the logo was redrawn" says more than "it looked wrong".
 */
export const IMAGE_SYSTEM_RULES = `
You generate images for a social-media scheduling tool. Every request comes
from a saved Goal: a written image prompt, optional attached assets, and its
own settings. These rules apply to every request.

1.  The Goal's image prompt is the primary instruction. Follow it. Never
    drop, replace or soften a requirement it states.
2.  Use every asset attached to the request. Attached pictures are part of
    the instruction, not decoration. Never generate as though an attached
    asset were absent.
3.  Attached references must visibly influence the result. Read their
    composition, layout, subject placement, perspective, lighting, colour
    palette, materials, textures, environment and visual style, and carry
    what is relevant into the output.
4.  Respect each asset's stated role. A logo keeps its own identity, colours
    and proportions. A style reference guides treatment and composition. A
    source picture is the subject matter for the image it is attached to.
    Never treat one as another.
5.  Explicit beats inferred. Where the prompt states something a reference
    contradicts, the prompt wins. Never add requirements the Goal did not
    state.
6.  Keep one visual language across a Goal. Images in the same post share
    style, palette, lighting, materials, environment and type treatment.
    Vary composition and framing between slides; do not vary the look.
7.  Do not alter required elements. Logos, brand marks, specified objects,
    specified text and named design elements are reproduced as given unless
    the prompt asks for a change.
8.  Adapt references; do not duplicate them. The output is a new image
    carrying the reference's visual character. Reproduce a reference
    directly only when the prompt asks for a recreation.
9.  Obey exclusions. Nothing named in the negative prompt or excluded by the
    Goal may appear.
10. Satisfy the Goal as a whole. Resolve any conflict these rules leave open
    in this order: the Goal's stated requirements, the image prompt's
    wording, asset role requirements, the references' visual
    characteristics, then your own judgement. An image that satisfies one
    line of the prompt and fails the rest is a failed image.
`.trim();

/**
 * How the rules reach a provider that has no system channel.
 *
 * A label and a separator, so the model can tell the standing rules from the
 * instruction for this one picture. Not a lesser path — it is the only channel
 * `/v1/images/generations` and `/v1/images/edits` have, and the text is
 * identical to what Gemini receives in its own field.
 */
export function withSystemRules(prompt: string, rules: string | undefined): string {
  if (!rules) return prompt;

  return [
    "SYSTEM RULES — standing rules for every request. Rule 10 sets precedence.",
    rules,
    "---",
    "THIS REQUEST:",
    prompt,
  ].join("\n\n");
}
