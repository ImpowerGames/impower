import { Create } from "../../../core/types/Create";
import { Animation } from "../types/Animation";

export const default_animation: Create<Animation> = (obj) => ({
  $type: "animation",
  $name: "$default",
  target: { $type: "layer", $name: "self" },
  ...obj,
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
