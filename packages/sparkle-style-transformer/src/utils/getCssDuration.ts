import getCssUnit from "./getCssUnit.js";

const getCssDuration = (value: string | null, defaultValue = "0s"): string => {
  if (!value) {
    return defaultValue;
  }
  return getCssUnit(value, "s");
};

export default getCssDuration;
