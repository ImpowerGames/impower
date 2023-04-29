import { getCssUnit } from "./getCssUnit";

export const getCssBlur = (value: string): string => {
  if (value) {
    return `blur(${getCssUnit(value, "px")})`;
  }
  return value;
};
