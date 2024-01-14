import RATIOS from "../constants/RATIOS";
import roundToRatioDecimal from "./roundToRatioDecimal";

const getRatio = (num: number): string | undefined => {
  const integer = Math.floor(num);
  if (num === integer) {
    return `${integer}`;
  }
  const rounded = roundToRatioDecimal(num);
  return RATIOS[rounded];
};

export default getRatio;
