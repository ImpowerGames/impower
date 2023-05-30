import getCssUnit from "./getCssUnit.js";

const isNumberChar = (c: string | undefined): boolean =>
  !Number.isNaN(Number(c));

const isVariableValue = (value: string | number | undefined): boolean => {
  if (typeof value === "number") {
    return false;
  }
  if (!value) {
    return false;
  }
  if (value[0] === "-") {
    return false;
  }
  if (isNumberChar(value[0])) {
    return false;
  }
  return true;
};

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
  if (isVariableValue(value)) {
    return `var(--s-size-${value})`;
  }
  return getCssUnit(value, defaultUnit);
};

export default getCssSize;
