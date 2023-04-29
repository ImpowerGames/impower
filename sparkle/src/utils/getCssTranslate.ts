import { getCssUnit } from "./getCssUnit";

export const getCssTranslate = (value: string): string => {
  if (value === "none") {
    return "0";
  }
  return getCssUnit(`${value}`, "px");
};
