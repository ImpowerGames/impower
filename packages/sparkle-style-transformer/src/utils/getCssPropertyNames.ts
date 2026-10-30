import { CSS_UTILITIES } from "../constants/CSS_UTILITIES.js";
import { getSparklePropertyName } from "./getCssEquivalent.js";
import { getCssPropertyName } from "./getCssPropertyName.js";

export const getCssPropertyNames = (key: string): string[] => {
  const cssUtilities: Record<
    string,
    Record<string, Record<string, string>>
  > = CSS_UTILITIES;

  const cssUtility = cssUtilities[getSparklePropertyName(key)];
  if (!cssUtility) {
    return [getCssPropertyName(key)];
  }
  const names = new Set<string>();
  for (const selector of Object.values(cssUtility)) {
    for (const cssProp of Object.keys(selector)) {
      names.add(cssProp);
    }
  }
  return [...names];
};
