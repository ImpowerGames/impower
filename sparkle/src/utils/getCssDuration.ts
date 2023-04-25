import { getCssUnit } from "./getCssUnit";

export const getCssDuration = (value: string): string => {
  return getCssUnit(value, "s");
};
