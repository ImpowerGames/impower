import { getCssUnit } from "./getCssUnit";

export const getCssRotate = (value: string): string => {
  if (value === "none") {
    return "0";
  }
  return getCssUnit(`${value}`, "deg");
};
