import { CSS_ALIASES } from "../constants/CSS_ALIASES.js";
import { CSS_UTILITIES } from "../constants/CSS_UTILITIES.js";
import { STYLE_ALIASES } from "../constants/STYLE_ALIASES.js";

export const getCssPropertyNames = (key: string): string[] => {
  const aliases: Record<string, string> = {
    ...STYLE_ALIASES,
    ...CSS_ALIASES,
  };
  const cssUtilities: Record<
    string,
    Record<string, Record<string, string>>
  > = CSS_UTILITIES;

  const cssUtility = cssUtilities[aliases[key] ?? key];
  if (!cssUtility) {
    return [key];
  }
  const names = new Set<string>();
  for (const selector of Object.values(cssUtility)) {
    for (const cssProp of Object.keys(selector)) {
      names.add(cssProp);
    }
  }
  return [...names];
};
