import { Graphic } from "../types/graphic";
import { generateCSSGraphic } from "./generateCSSGraphic";

const REGEX_ARG_SEPARATOR = /[ ]+/;

export const getCssIcon = (
  value: string,
  suffix = "",
  icons?: Record<string, Graphic>
): string => {
  if (!value || value === "none") {
    return "none";
  }
  if (value.startsWith("var(") || value.startsWith("url(")) {
    return value;
  }
  const args = value.trim().split(REGEX_ARG_SEPARATOR);
  const name = args?.[0];
  if (name) {
    const graphic = icons?.[name];
    if (graphic) {
      const url = generateCSSGraphic(graphic, args);
      return url;
    }
  }
  return `var(--s-icon-${name}${suffix})`;
};
