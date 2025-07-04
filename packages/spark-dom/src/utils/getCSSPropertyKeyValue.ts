import { getImageVarName } from "../../../spark-engine/src/game/modules/ui/utils/getImageVarName";
import { getCSSPropertyName } from "./getCSSPropertyName";

const createTextShadow = (r: number, color = "black", unit = "px"): string => {
  return createShadows(r, color, unit).join(", ") || "none";
};

const createShadows = (r: number, color = "black", unit = "px"): string[] => {
  if (r === 0) {
    return [];
  }
  // number of shadows
  const n = Math.ceil(2 * Math.PI * r);
  const shadows: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const theta = (2 * Math.PI * i) / n;
    shadows.push(
      `${r * Math.cos(theta)}${unit} ${r * Math.sin(theta)}${unit} 1px ${color}`
    );
  }
  return shadows;
};

const isNumber = (value: unknown): value is number => {
  return !Number.isNaN(Number(value));
};

const VALUE_AND_UNIT_REGEX = /((?:\d*[.])?\d+)([a-z]+)/;

export const getCSSPropertyKeyValue = (
  name: string,
  value: unknown
): [string, string] => {
  if (name.startsWith("--")) {
    return [name, String(value)];
  }
  const cssProp = getCSSPropertyName(name);
  const cssValue = value;
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
  if (
    cssProp === "background-image" &&
    typeof cssValue === "object" &&
    "$name" in cssValue &&
    typeof cssValue.$name === "string"
  ) {
    const varValue = `var(${getImageVarName(cssValue.$name)})`;
    return [cssProp, varValue];
  }
  if (
    cssProp === "font-family" &&
    typeof cssValue === "object" &&
    "$name" in cssValue &&
    typeof cssValue.$name === "string"
  ) {
    return [cssProp, cssValue.$name];
  }
  if (
    cssProp === "font-family" &&
    typeof cssValue === "object" &&
    "$name" in cssValue &&
    typeof cssValue.$name === "string"
  ) {
    const name = cssValue.$name;
    return [cssProp, name];
  }
  if (cssProp === "text-stroke") {
    if (cssValue === "none" || cssValue === "0" || cssValue === 0) {
      return ["text-shadow", "none"];
    }
    if (isNumber(cssValue)) {
      return ["text-shadow", createTextShadow(cssValue)];
    }
    if (typeof cssValue === "string") {
      const parts = cssValue.split(" ");
      const match = parts[0]?.match(VALUE_AND_UNIT_REGEX);
      const r = match?.[1];
      const unit = match?.[2];
      const num = Number(r);
      if (!Number.isNaN(num)) {
        return ["text-shadow", createTextShadow(num, parts[1], unit)];
      }
    }
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
