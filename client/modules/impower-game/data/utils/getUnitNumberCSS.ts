import { UnitNumberData } from "../../../impower-core";

export const getUnitNumberCSS = (unitNumberData: UnitNumberData): string => {
  const { unit, value } = unitNumberData;
  switch (unit) {
    case "Pixels":
      return `${value}px`;
    case "Percentage":
      return `${value}%`;
    default:
      return `${value}px`;
  }
};
