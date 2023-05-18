import getCssSize from "./getCssSize.js";

const getCssCorner = (value: string): string => {
  if (value === "full" || value === "pill") {
    return "9999px";
  }
  if (value === "circle") {
    return "50%";
  }
  return getCssSize(value);
};

export default getCssCorner;
