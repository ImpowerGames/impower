import getCssUnit from "./getCssUnit.js";

const getCssRotate = (value: string): string => {
  if (value === "none") {
    return "0";
  }
  return getCssUnit(`${value}`, "deg");
};

export default getCssRotate;
