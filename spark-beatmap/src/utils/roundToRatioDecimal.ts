import { RATIOS } from "../constants/RATIOS";

const closest = (arr: number[], goal: number) =>
  arr.reduce(function (prev, curr) {
    return Math.abs(curr - goal) < Math.abs(prev - goal) ? curr : prev;
  });

export const roundToRatioDecimal = (num: number): number => {
  const integer = Math.floor(num);
  const remainder = num - integer;
  const ratioDecimals = Object.keys(RATIOS).map((k) => Number(k));
  const roundedRemainder = closest(ratioDecimals, remainder);
  if (roundedRemainder === 0 || roundedRemainder === 1) {
    return Math.round(num);
  }
  return integer + roundedRemainder;
};
