import { clamp } from "./clamp";

export const percentToPercentage = (percent: number): string => {
  const percentage = clamp(percent, 0, 100);
  return `${percentage}%`;
};
