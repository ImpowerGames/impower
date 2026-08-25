import { getVarName } from "../../../spark-engine/src/game/modules/ui/utils/getVarName";
import { getCSSPropertyName } from "./getCSSPropertyName";

const isNumber = (value: unknown): value is number => {
  return !Number.isNaN(Number(value));
};


export const getCSSPropertyKeyValue = (
  name: string,
  value: unknown,
): [string, string] => {
  // A custom property keeps its name, but NOT its old early return: the value
  // still goes through the resolution below, so a resolved token object becomes
  // `var(--theme-color-…)` rather than stringifying to `[object Object]`.
  //
  // Aliases like `#spinner-color` are deliberately NOT renamed here. They are
  // declared in CSS_UTILITIES, which renames AND runs the colour transformer in
  // one place; doing the rename here as well produced a prop that emitted
  // `--spinner-color: sky_60` — the right name carrying an unresolved token,
  // because the value transformer keys off the AUTHORED name and never saw it.
  const cssProp = name.startsWith("--") ? name : getCSSPropertyName(name);
  const cssValue =
    typeof value === "object" &&
    value &&
    "$type" in value &&
    typeof value.$type === "string" &&
    value.$type &&
    "$name" in value &&
    typeof value.$name === "string" &&
    value.$name
      ? `var(${getVarName(value.$type, value.$name)})`
      : typeof value === "object" &&
          value &&
          "$name" in value &&
          typeof value.$name === "string" &&
          value.$name
        ? value.$name
        : value;
  if (cssValue == null || cssValue === "") {
    return [cssProp, ""];
  }
  if (cssProp === "animation-duration" && isNumber(cssValue)) {
    return [cssProp, `${cssValue}s`];
  }
  if (cssProp === "animation-delay" && isNumber(cssValue)) {
    return [cssProp, `${cssValue}s`];
  }
  if (cssProp === "easing") {
    return ["animation-timing-function", String(cssValue)];
  }
  if (cssProp === "iterations") {
    return ["animation-iteration-count", String(cssValue)];
  }
  if (cssProp === "duration") {
    const timeValue = isNumber(cssValue)
      ? `${cssValue}s`
      : typeof cssValue === "string"
        ? cssValue
        : "0s";
    return ["animation-duration", timeValue];
  }
  if (cssProp === "delay") {
    const timeValue = isNumber(cssValue)
      ? `${cssValue}s`
      : typeof cssValue === "string"
        ? cssValue
        : "0s";
    return ["animation-delay", timeValue];
  }
  if (cssProp === "src" && typeof cssValue === "string") {
    const src = cssValue.trim();
    const urlValue = src.includes("(") ? src : `url('${encodeURI(src)}')`;
    return [cssProp, urlValue];
  }
  if (cssProp === "line-height") {
    return [cssProp, String(cssValue)];
  }
  if (
    cssProp === "gap" ||
    cssProp === "border-radius" ||
    cssProp === "padding" ||
    cssProp === "margin" ||
    cssProp === "width" ||
    cssProp === "height" ||
    cssProp === "top" ||
    cssProp === "bottom" ||
    cssProp === "left" ||
    cssProp === "right" ||
    cssProp === "inset" ||
    cssProp.endsWith("-width") ||
    cssProp.endsWith("-height") ||
    cssProp.endsWith("-top") ||
    cssProp.endsWith("-bottom") ||
    cssProp.endsWith("-left") ||
    cssProp.endsWith("-right")
  ) {
    if (Array.isArray(cssValue)) {
      return [
        cssProp,
        cssValue.map((x) => (isNumber(x) ? `${x}px` : x)).join(" "),
      ];
    }
    if (isNumber(cssValue)) {
      return [cssProp, `${cssValue}px`];
    }
  }
  if (typeof cssValue === "object") {
    return [cssProp, ""];
  }
  return [cssProp, String(cssValue)];
};
