import getUnitSymbolFromType from "./getUnitSymbolFromType";
import hslaToHex from "./hslaToHex";
import isColor from "./isColor";
import isUnitNumberData from "./isUnitNumberData";

const getDataDisplayValue = <T>(value: T): string => {
  if (value === null) {
    return "None";
  }
  if (isColor(value)) {
    return hslaToHex(value);
  }
  if (isUnitNumberData(value)) {
    return `${value.value}${getUnitSymbolFromType(value.unit)}`;
  }
  if (typeof value === "object") {
    return `(${Object.values(value)
      .filter((v) => v !== undefined && value !== null)
      .map((v) => getDataDisplayValue(v))
      .join(", ")})`;
  }
  return String(value);
};

export default getDataDisplayValue;
