import { RATIOS } from "../constants/RATIOS";
import { roundToRatioDecimal } from "./roundToRatioDecimal";

export const roundDecimalToRatio = (decimal: number): string => {
  if (decimal === Math.floor(decimal)) {
    return Math.floor(decimal).toString();
  } else {
    const rounded = roundToRatioDecimal(decimal);
    return RATIOS[rounded] ?? `${decimal.toFixed(4)}`;
  }
};
