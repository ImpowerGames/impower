import Graphic from "../types/graphic.js";
import generateCSSGraphic from "./generateCSSGraphic.js";
import generateGraphicUrl from "./generateGraphicUrl.js";

const REGEX_ARG_SEPARATOR = /[ ]+/;

const getCssPattern = (
  value: string,
  patterns: Record<string, Graphic>
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
    const patternGraphic = patterns?.[name];
    if (patternGraphic) {
      const { graphic, angle, zoom } = generateCSSGraphic(patternGraphic, args);
      if (graphic?.shapes?.[0]?.d) {
        const url = generateGraphicUrl(graphic, true, angle, zoom);
        return url;
      }
    }
  }
  return `var(--s-pattern-${value})`;
};

export default getCssPattern;
