import { isAnimation } from "./isAnimation";
import { isElement } from "./isElement";

export const cancelAnimations = async (
  ...targets: (Element | Animation | null)[]
): Promise<Animation[]> => {
  const elements = targets.filter(isElement);
  const animations = targets.filter(isAnimation);
  if (elements.length > 0) {
    elements.forEach((el) => {
      animations.push(...el.getAnimations());
    });
  }
  animations.forEach((animation) => {
    animation.cancel();
  });
  return animations;
};
