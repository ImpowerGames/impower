import { getCssSize } from "./getCssSize";

export const getCssCorner = (value: string): string => {
  if (value === "full" || value === "pill") {
    return "9999px";
  }
  if (value === "circle") {
    return "50%";
  }
  return getCssSize(value);
};
