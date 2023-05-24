import { isAnimation } from "./isAnimation";
import { isElement } from "./isElement";

export const finishAnimations = (
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
    animation.finish();
  });
  return animations;
};
