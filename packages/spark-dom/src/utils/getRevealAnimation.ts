import { Animation } from "../../../spark-engine/src/game/modules/ui/types/Animation";

/**
 * [D14] Consumer-side reconstruction of the per-letter `show` reveal animation
 * that the engine's `UIModule.getAnimationDefinition({ name: "show", ... })`
 * used to produce for every glyph.
 *
 * The `show` builtin is a constant
 * (`keyframes: [{ opacity: "1" }]`, `easing: "linear"`, `fill: "both"`), so the
 * only per-letter variation is the `after`/`over` timing carried on each
 * `TextInstruction`. Reproducing it here (rather than shipping N resolved
 * `Animation`s over the wire) is what lets D14 collapse the per-glyph emission
 * to a single message per write while preserving the exact reveal timing.
 *
 * Note: text instructions never carry an `ease` (the interpreter only sets
 * `ease` on image/audio events), so the engine's `context.ease[...]` lookup
 * was always a no-op for text — `easing` stays the builtin "linear".
 */
export const getRevealAnimation = (
  event: { after?: number; over?: number },
  instant: boolean,
): Animation => {
  const { after, over } = event;
  const delay = instant ? "0s" : `${after ?? 0}s`;
  const duration = instant ? "0s" : over != null ? `${over}s` : "0s";
  return {
    $type: "animation",
    $name: "show",
    target: { $type: "layer", $name: "self" },
    keyframes: [{ opacity: "1" }],
    timing: {
      delay,
      duration,
      iterations: 1,
      easing: "linear",
      fill: "both",
      direction: "normal",
    },
  };
};
