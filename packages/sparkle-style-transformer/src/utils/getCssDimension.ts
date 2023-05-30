import getCssSize from "./getCssSize.js";

const getCssDimension = (value: number | string): string => {
  if (value === -1 || value === "") {
    return "100%";
  }
  if (value === "none" || value === "auto") {
    return value;
  }
  return getCssSize(value, "px");
};

export default getCssDimension;
