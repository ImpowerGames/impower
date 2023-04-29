import { getCssUnit } from "./getCssUnit";

export const getCssDimension = (value: number | string): string => {
  if (value === -1 || value === "") {
    return "100%";
  }
  if (value === "none" || value === "auto") {
    return value;
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
  return getCssUnit(`${value}`, "px");
};
