import type { Create } from "../../../core/types/Create";
import type { Animation } from "../types/Animation";

export const default_animation: Create<Animation> = (obj) => ({
  $type: "animation",
  $name: "$default",
  ...obj,
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
