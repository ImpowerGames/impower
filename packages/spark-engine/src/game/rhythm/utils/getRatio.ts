import { RATIOS } from "../constants/RATIOS";
import { roundToRatioDecimal } from "./roundToRatioDecimal";

export const getRatio = (num: number): string | undefined => {
  const integer = Math.floor(num);
  if (num === integer) {
    return `${integer}`;
  }
  const rounded = roundToRatioDecimal(num);
  return RATIOS[rounded];
};
