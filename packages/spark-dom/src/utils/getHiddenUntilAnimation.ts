import type { Animation } from "../../../spark-engine/src/game/modules/ui/types/Animation";

/**
 * Keeps an element hidden until `after` seconds past the animation's start,
 * including any time before the start itself. A played text write hides an
 * empty target this way until its first letter's reveal begins, which for a
 * choice under a caption is once the caption has typed out.
 *
 * `visibility` rather than `display` or `opacity`: the element keeps its place
 * in the layout, so nothing moves when it appears, and while hidden it takes
 * no pointer events or focus, so it cannot be chosen before it is seen.
 */
export const getHiddenUntilAnimation = (after: number): Animation => ({
  $type: "animation",
  $name: "hidden_until",
  target: { $type: "layer", $name: "self" },
  // A single keyframe would interpolate toward the element's own
  // `visibility`, which reads as visible from the first moment of the
  // animation.
  keyframes: [{ visibility: "hidden" }, { visibility: "hidden" }],
  timing: {
    delay: "0s",
    duration: `${after}s`,
    iterations: 1,
    easing: "linear",
    // A played beat is written a moment before it shows; filling backwards
    // keeps the element hidden through that moment too.
    fill: "backwards",
    direction: "normal",
  },
});
