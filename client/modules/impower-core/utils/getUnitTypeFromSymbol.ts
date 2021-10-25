import { UnitType } from "../types/enums/unitType";

const getUnitTypeFromSymbol = (symbol: string): UnitType => {
  if (symbol.toLowerCase() === "px") {
    return "Pixels";
  }
  if (symbol.toLowerCase() === "pixels") {
    return "Pixels";
  }
  if (symbol.toLowerCase() === "pixel") {
    return "Pixels";
  }
  if (symbol.toLowerCase() === "pix") {
    return "Pixels";
  }

  if (symbol === "%") {
    return "Percentage";
  }
  if (symbol.toLowerCase() === "percentage") {
    return "Percentage";
  }
  if (symbol.toLowerCase() === "percent") {
    return "Percentage";
  }
  if (symbol.toLowerCase() === "per") {
    return "Percentage";
  }

  return "Pixels";
};

export default getUnitTypeFromSymbol;
