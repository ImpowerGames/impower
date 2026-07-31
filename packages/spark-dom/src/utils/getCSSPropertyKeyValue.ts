import { toCustomPropertyName } from "../../../sparkdown/src/compiler/constants/dataAttributeProps";
import { getVarName } from "../../../spark-engine/src/game/modules/ui/utils/getVarName";
import { getCSSPropertyName } from "./getCSSPropertyName";

const isNumber = (value: unknown): value is number => {
  return !Number.isNaN(Number(value));
};


export const getCSSPropertyKeyValue = (
  name: string,
  value: unknown,
): [string, string] => {
  // A custom property, either written as one (`#--spinner-color`) or aliased to
  // one (`#spinner-color`). Only the NAME is special; the value still goes
  // through the resolution below, so an already-resolved token object becomes
  // `var(--theme-color-…)` instead of stringifying to `[object Object]`, which
  // is what the early return it replaced used to do.
  //
  // KNOWN GAP: a BARE token name does not reach here as an object. Upstream
  // resolves `sky_60` to a colour only for props it knows are colour-valued,
  // and an aliased custom property is not one, so `#spinner-color=sky_60`
  // arrives as the string `"sky_60"` and emits an inert declaration. Literals
  // (`"red"`, `"#8891a4"`) and an explicit `"var(--theme-color-sky_60)"` both
  // work. Teaching the compiler that an alias is colour-valued is the real
  // fix; it is not in this layer.
  const cssProp = name.startsWith("--")
    ? name
    : (toCustomPropertyName(name) ?? getCSSPropertyName(name));
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
