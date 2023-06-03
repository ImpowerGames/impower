export const cancelAnimations = (target: Element | null): Animation[] => {
  if (!target) {
    return [];
  }
  const animations = target.getAnimations();
  animations.forEach((animation) => animation.cancel());
  return animations;
};
