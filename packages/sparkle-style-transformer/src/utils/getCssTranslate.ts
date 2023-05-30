import getCssUnit from "./getCssUnit.js";

const getCssTranslate = (value: string): string => {
  if (value === "none") {
    return "0";
  }
  return getCssUnit(`${value}`, "px");
};

export default getCssTranslate;
