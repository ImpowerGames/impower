import { UnitType } from "../types/enums/unitType";

const getUnitSymbolFromType = (unit: UnitType): string => {
  switch (unit) {
    case "Pixels":
      return "px";
    case "Percentage":
      return "%";
    default:
      return "px";
  }
};

export default getUnitSymbolFromType;
