import { Create } from "../../../core/types/Create";
import { Animation } from "../types/Animation";

export const _animation: Create<Animation> = (obj) => ({
  $type: "animation",
  ...obj,
  keyframes: obj.keyframes ?? [],
  timing: {
    delay: 0,
    duration: 0,
    easing: "ease",
    iterations: 1,
    direction: "normal",
    fill: "none",
    ...(obj.timing || {}),
  },
});
