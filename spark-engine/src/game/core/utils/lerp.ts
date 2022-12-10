import { EASE } from "../constants/EASE";
import { interpolate } from "./interpolate";

export const lerp = (percentage: number, min: number, max: number) => {
  return interpolate(percentage, min, max, EASE.linear);
};
