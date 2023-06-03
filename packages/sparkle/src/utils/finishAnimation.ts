export const finishAnimation = (
  target: Element | null,
  animationName?: string
): Animation | null => {
  if (!target) {
    return null;
  }
  const animation = target
    .getAnimations()
    .filter(
      (animation) =>
        !animationName || (animation as any).animationName === animationName
    )?.[0];
  if (!animation) {
    return null;
  }
  animation.finish();
  return animation;
};
