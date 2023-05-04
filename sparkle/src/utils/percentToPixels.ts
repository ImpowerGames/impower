export const percentToPixels = (
  percent: number,
  parentSize: number
): number => {
  return parentSize * (percent / 100);
};
