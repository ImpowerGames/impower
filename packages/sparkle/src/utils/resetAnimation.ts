export const resetAnimation = (
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
  animation.currentTime = 0;
  animation.playbackRate = 1;
  animation.pause();
  return animation;
};
