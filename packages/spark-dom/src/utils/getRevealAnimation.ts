import type { Animation } from "../../../spark-engine/src/game/modules/ui/types/Animation";

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
