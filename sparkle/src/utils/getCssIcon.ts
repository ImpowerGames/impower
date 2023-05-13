import Icons from "../helpers/icons";
import { generateCSSGraphic } from "./generateCSSGraphic";

const REGEX_ARG_SEPARATOR = /[ ]+/;

export const getCssIcon = (value: string, suffix = ""): string => {
  if (!value || value === "none") {
    return "none";
  }
  if (value.startsWith("var(") || value.startsWith("url(")) {
    return value;
  }
  const args = value.trim().split(REGEX_ARG_SEPARATOR);
  const name = args?.[0];
  if (name) {
    const graphic = Icons.get(name);
    if (graphic) {
      const url = generateCSSGraphic(graphic, args);
      return url;
    }
  }
  return `var(--s-icon-${name}${suffix})`;
};
