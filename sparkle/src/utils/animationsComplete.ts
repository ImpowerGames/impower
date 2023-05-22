import { nextAnimationFrame } from "./nextAnimationFrame";

const isElement = (el: Element | null): el is Element => el instanceof Element;

export const animationsComplete = async (
  ...elements: (Element | null)[]
): Promise<void> => {
  await nextAnimationFrame();
  const promises = elements
    .filter(isElement)
    .flatMap((el) => el.getAnimations().map((animation) => animation.finished));
  await Promise.allSettled(promises);
  await nextAnimationFrame();
};
