import type { Create } from "../../../core/types/Create";
import type { Animation } from "../types/Animation";

export const default_animation: Create<Animation> = (obj) => ({
  $type: "animation",
  $name: "$default",
  ...obj,
  // Merge over the default rather than replacing it: a caller supplying only
  // part of the target would otherwise leave the rest undefined.
  target: { $type: "layer", $name: "self", ...(obj?.target ?? {}) },
  keyframes: obj?.keyframes ?? [],
  timing: {
    delay: 0,
    duration: 0,
    easing: "ease",
    iterations: 1,
    fill: "both",
    direction: "normal",
    ...(obj?.timing || {}),
  },
});
