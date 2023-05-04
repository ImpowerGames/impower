import { percentToPercentage } from "./percentToPercentage";
import { pixelsToPercent } from "./pixelsToPercent";

export const pixelsToPercentage = (
  pixels: number,
  parentSize: number
): string => {
  const percent = pixelsToPercent(pixels, parentSize);
  return percentToPercentage(percent);
};
