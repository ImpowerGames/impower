import { getCssUnit } from "./getCssUnit";

export const getCssSize = (value: string): string => {
  if (value === "") {
    return "8px";
  }
  if (value === "xs") {
    return "2px";
  }
  if (value === "sm") {
    return "4px";
  }
  if (value === "md") {
    return "8px";
  }
  if (value === "lg") {
    return "16px";
  }
  if (value === "xl") {
    return "24px";
  }
  return getCssUnit(value, "px");
};
