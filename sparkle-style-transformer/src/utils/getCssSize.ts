import getCssUnit from "./getCssUnit.js";

const getCssSize = (
  value: string | number,
  defaultUnit: "px" | "rem" = "px"
): string => {
  if (value === "none") {
    return "0";
  }
  if (value === "") {
    return defaultUnit === "px" ? "8px" : "0.5rem";
  }
  if (value === "xs") {
    return defaultUnit === "px" ? "2px" : "0.125rem";
  }
  if (value === "sm") {
    return defaultUnit === "px" ? "4px" : "0.25rem";
  }
  if (value === "md") {
    return defaultUnit === "px" ? "8px" : "0.5rem";
  }
  if (value === "lg") {
    return defaultUnit === "px" ? "16px" : "1rem";
  }
  if (value === "xl") {
    return defaultUnit === "px" ? "24px" : "1.5rem";
  }
  return getCssUnit(value, defaultUnit);
};

export default getCssSize;
