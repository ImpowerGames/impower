import { Graphic } from "../types/graphic";
import { generateCSSGraphic } from "./generateCSSGraphic";

const REGEX_ARG_SEPARATOR = /[ ]+/;

export const getCssPattern = (
  value: string,
  patterns?: Record<string, Graphic>
): string => {
  if (!value || value === "none") {
    return "none";
  }
  if (value.startsWith("var(") || value.startsWith("url(")) {
    return value;
  }
  const args = value.split(REGEX_ARG_SEPARATOR);
  const name = args?.[0];
  if (name) {
    const graphic = patterns?.[name];
    if (graphic) {
      return generateCSSGraphic(graphic, args, true);
    }
  }
  return `var(--s-pattern-${value})`;
};
