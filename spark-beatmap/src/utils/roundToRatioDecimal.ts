import { RATIOS } from "../constants/RATIOS";

export const roundToRatioDecimal = (num: number): number => {
  const integer = Math.floor(num);
  const remainder = num - integer;
  const closest = Object.keys(RATIOS)
    .map((k) => Number(k))
    .reduce(function (prev, curr) {
      return Math.abs(curr - remainder) < Math.abs(prev - remainder)
        ? curr
        : prev;
    });
  if (closest === 0 || closest === 1) {
    return Math.round(num);
  }
  return integer + closest;
};
