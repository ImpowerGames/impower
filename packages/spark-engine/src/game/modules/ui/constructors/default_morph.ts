import type { Create } from "../../../core/types/Create";
import type { Morph } from "../types/Morph";

export const default_morph: Create<Morph> = (obj) => ({
  $type: "morph",
  $name: "$default",
  blend: "morph",
  fallback: "fade",
  ...obj,
  layers: (obj?.layers ?? {}) as Morph["layers"],
  keyframes: (obj?.keyframes ?? []) as Morph["keyframes"],
  clips: (obj?.clips ?? []) as Morph["clips"],
  timing: {
    delay: 0,
    duration: 0.25,
    easing: "ease-out",
    iterations: 1,
    direction: "normal",
    ...(obj?.timing || {}),
  },
});
