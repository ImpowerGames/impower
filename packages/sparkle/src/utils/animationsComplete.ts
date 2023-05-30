import { isAnimation } from "./isAnimation";
import { isElement } from "./isElement";
import { nextAnimationFrame } from "./nextAnimationFrame";

export const animationsComplete = async (
  ...targets: (Element | Animation | null)[]
): Promise<Animation[]> => {
  const elements = targets.filter(isElement);
  const animations = targets.filter(isAnimation);
  if (elements.length > 0) {
    await nextAnimationFrame();
    elements.forEach((el) => {
      animations.push(...el.getAnimations());
    });
  }
  await Promise.allSettled(animations.map((animation) => animation.finished));
  await nextAnimationFrame();
  return animations;
};
