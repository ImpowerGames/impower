import Patterns from "../helpers/patterns";
import { generatePatternUrl } from "./generatePatternUrl";

const REGEX_SEPARATOR = /[ ]+/;

export const getCssPattern = (value: string): string => {
  if (!value || value === "none") {
    return "none";
  }
  if (value.startsWith("var(") || value.startsWith("url(")) {
    return value;
  }
  const values = value.split(REGEX_SEPARATOR);
  const name = values?.[0];
  if (name) {
    const pattern = Patterns.get(name);
    if (pattern) {
      const angleIndex = values.findIndex((v) => v.endsWith("deg"));
      const angleValue = Number(values[angleIndex]?.replace("deg", ""));
      const angle = !Number.isNaN(angleValue) ? angleValue : 0;
      const zoomIndex = values.findIndex((v) => v.endsWith("%"));
      const zoomValue = Number(values[zoomIndex]?.replace("%", ""));
      const zoom = !Number.isNaN(zoomValue) ? zoomValue / 100 : 1;
      const strokeIndex = values.findIndex((v) => !Number.isNaN(Number(v)));
      const strokeWidthValue = Number(values[strokeIndex]);
      const strokeWidth = !Number.isNaN(strokeWidthValue)
        ? strokeWidthValue
        : 1;
      const colorsIndex = Math.max(0, angleIndex, zoomIndex, strokeIndex) + 1;
      const colors =
        colorsIndex < values.length ? values.slice(colorsIndex) : [];
      return generatePatternUrl(
        {
          ...pattern,
          shapes: pattern.shapes?.map((s, i) => ({
            ...s,
            stroke: colors[i] || s.stroke,
            strokeWidth,
          })),
        },
        true,
        angle,
        zoom
      );
    }
  }
  return `var(--s-pattern-${value})`;
};
