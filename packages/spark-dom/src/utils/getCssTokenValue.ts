import {
  escapeCssIdentifier,
  getThemeVariableName,
} from "../../../sparkle-style-transformer/src/utils/themeVariableName";

export const getCssTokenValue = (value: unknown): unknown => {
  if (
    typeof value === "object" &&
    value &&
    "$name" in value &&
    typeof value.$name === "string" &&
    value.$name
  ) {
    if ("$type" in value && typeof value.$type === "string" && value.$type) {
      return `var(${escapeCssIdentifier(getThemeVariableName(value.$type, value.$name))})`;
    }
    return value.$name;
  }
  return value;
};
