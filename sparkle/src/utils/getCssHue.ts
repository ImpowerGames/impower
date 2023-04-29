import { getCssUnit } from "./getCssUnit";

export const getCssHue = (value: string): string => {
  if (value) {
    return `hue-rotate(${getCssUnit(value, "deg")})`;
  }
  return value;
};
