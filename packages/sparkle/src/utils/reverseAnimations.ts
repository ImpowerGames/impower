import { isAnimation } from "./isAnimation";
import { isElement } from "./isElement";

export const reverseAnimations = async (
  ...targets: (Element | Animation | null)[]
): Promise<Animation[]> => {
  const elements = targets.filter(isElement);
  const animations = targets.filter(isAnimation);
  if (elements.length > 0) {
    elements.forEach((el) => {
      animations.push(...el.getAnimations());
    });
  }
  await Promise.allSettled(
    animations.map((animation) => {
      animation.pause();
      animation.reverse();
      return animation.finished;
    })
  );
  return animations;
};
