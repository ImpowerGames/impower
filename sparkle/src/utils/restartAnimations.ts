import { isAnimation } from "./isAnimation";
import { isElement } from "./isElement";

export const restartAnimations = (
  ...targets: (Element | Animation | null)[]
): Animation[] => {
  const elements = targets.filter(isElement);
  const animations = targets.filter(isAnimation);
  if (elements.length > 0) {
    elements.forEach((el) => {
      animations.push(...el.getAnimations());
    });
  }
  animations.map((animation) => {
    animation.currentTime = 0;
    animation.playbackRate = 1;
    animation.play();
  });
  return animations;
};
