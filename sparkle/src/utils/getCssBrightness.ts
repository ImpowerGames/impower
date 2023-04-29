import { getCssSize } from "./getCssSize";

export const getCssBrightness = (value: string): string => {
  if (value) {
    return `brightness(${getCssSize(value)})`;
  }
  return value;
};
