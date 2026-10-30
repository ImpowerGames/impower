import type { Animation } from "../../../spark-engine/src/game/modules/ui/types/Animation";

export const getHiddenUntilAnimation = (after: number): Animation => ({
  $type: "animation",
  $name: "hidden_until",
  target: { $type: "layer", $name: "self" },
  keyframes: [{ visibility: "hidden" }, { visibility: "hidden" }],
  timing: {
    delay: "0s",
    duration: `${after}s`,
    iterations: 1,
    easing: "linear",
    fill: "backwards",
    direction: "normal",
  },
});
