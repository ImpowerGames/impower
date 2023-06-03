export const reverseAnimation = (
  target: Element | null,
  animationName: string
): Animation | null => {
  if (!target) {
    return null;
  }
  const animation = target
    .getAnimations()
    .find((animation) => (animation as any).animationName === animationName);
  if (!animation) {
    return animation || null;
  }
  animation.pause();
  animation.reverse();
  return animation;
};
