import { DEFAULT_ANIMATION_TIMING } from "../../../../../../sparkle-style-transformer/src/utils/animationShorthand";
import type { Create } from "../../../core/types/Create";
import type { Animation } from "../types/Animation";

export const default_animation: Create<Animation> = (obj) => ({
  $type: "animation",
  $name: "$default",
  ...obj,
  target: { $type: "layer", $name: "self", ...(obj?.target ?? {}) },
  keyframes: obj?.keyframes ?? [],
  timing: {
    ...DEFAULT_ANIMATION_TIMING,
    ...(obj?.timing || {}),
  },
});
