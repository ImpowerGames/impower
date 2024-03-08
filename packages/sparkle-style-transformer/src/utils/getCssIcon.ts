import Graphic from "../types/graphic.js";
import generateCSSGraphic from "./generateCSSGraphic.js";
import generateGraphicUrl from "./generateGraphicUrl.js";

const REGEX_ARG_SEPARATOR = /[ ]+/;

const getCssIcon = (value: string, icons: Record<string, Graphic>): string => {
  if (!value || value === "none") {
    return "none";
  }
  if (value.startsWith("var(") || value.startsWith("url(")) {
    return value;
  }
  const args = value.trim().split(REGEX_ARG_SEPARATOR);
  const name = args?.[0];
  if (name) {
    const iconGraphic = icons?.[name];
    if (iconGraphic) {
      const { graphic, angle, zoom } = generateCSSGraphic(iconGraphic, args);
      if (graphic?.shapes?.some((shape) => shape?.stroke || shape?.fill)) {
        const url = generateGraphicUrl(graphic, false, angle, zoom);
        return url;
      }
    }
  }
  return `var(--s-icon-${name})`;
};

export default getCssIcon;
