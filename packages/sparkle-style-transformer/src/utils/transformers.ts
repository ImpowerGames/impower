import { SPARKLE_TO_CSS_NAME_MAP } from "../constants/STYLE_ALIASES.js";

const WHITESPACE_REGEX = /[\t ]+/;
const VALUE_UNIT_REGEX = /^(\d+(?:\.\d+)?)([a-z]+)?$/;

/**
 * Quick positive‑list validator for CSS values we generate from the Sparkle
 * property helpers.
 *
 *  - Identifiers / numbers / operators handled by the helper that calls us.
 *  - `var(--foo)` references.
 *  - `url(...)` – permissive so we can embed `data:image/svg+xml,<svg …>` with
 *    raw angle‑brackets.
 *
 * If you need stronger guarantees (e.g. to block remote network URLs), wrap the
 * call site with an additional check.  For the in‑engine authoring context this
 * validator is primarily a typo‑guard to avoid breaking the style block.
 */
// eslint-disable-next-line no-useless-escape
const SAFE_CSS_VALUE_RE =
  /^(?:url\([^)]*\)|var\(.*\)|(?:rgb|rgba|hsl|hsla|lch)\([^)]*\)|(?:linear-gradient|radial-gradient|conic-gradient)\([^)]*\)|#[0-9a-f]{3,8}|[a-z0-9_-]+(?:\s+[a-z0-9_-]+)*|[0-9.+-]+(?:deg|px|rem|em|%|vh|vw|vmin|vmax)?)$/i;

/**
 * Whitelist‑based guard for values that will be concatenated into the `style`
 * attribute. Anything outside the allow‑list is replaced with the CSS keyword
 * `unset`, preventing malformed declarations from breaking the block.
 */
export function validateCss(value: string | null | undefined): boolean {
  if (value == null) {
    return true;
  }
  const v = String(value)?.trim() ?? "";
  return SAFE_CSS_VALUE_RE.test(v);
}

export const getCssAnimation = (value: string | null, suffix = ""): string => {
  if (!value || value === "none") {
    return "none";
  }
  if (value.startsWith("var(")) {
    return value;
  }
  return value
    .split(" ")
    .map((v) => `var(---theme-animation-${v}${suffix || ""})`)
    .join(", ");
};

export const getCssBgAlign = (value: string): string => {
  if (value === "") {
    return "center";
  }
  return value;
};

export const getCssBgFit = (value: string): string => {
  if (value === "") {
    return "contain";
  }
  if (value === "contain-vertically") {
    return "auto 100%";
  }
  if (value === "contain-horizontally") {
    return "100% auto";
  }
  return value;
};

export const getCssBlend = (value: string): string => {
  if (value === "") {
    return "normal";
  }
  return value;
};

export const getCssBorderStyle = (value: string): string => {
  if (value === "") {
    return "solid";
  }
  return value;
};

export const getCssColor = (color: string): string => {
  if (color === "current") {
    return "currentColor";
  }
  if (
    color === "none" ||
    color === "transparent" ||
    color === "black" ||
    color === "white" ||
    color === "currentColor" ||
    color.startsWith("#") ||
    color.startsWith("rgb") ||
    color.startsWith("hsl") ||
    color.startsWith("lch")
  ) {
    return color;
  }
  if (!color) {
    return color;
  }
  return `var(---theme-color-${color})`;
};

export const getCssChildColumns = (columns: string): string => {
  if (isValidNumber(columns)) {
    return "1fr ".repeat(Number(columns)).trim();
  }
  return columns;
};

export const getCssChildOverflow = (value: string): string => {
  if (value === "") {
    return "wrap";
  }
  if (value === "visible") {
    return "nowrap";
  }
  if (value === "reverse") {
    return "wrap-reverse";
  }
  return value;
};

export const getCssChildLayout = (value: string): string => {
  if (value === "") {
    return "row";
  }
  return value;
};

export const getCssChildJustify = (value: string): string => {
  if (value === "start") {
    return "flex-start";
  }
  if (value === "end") {
    return "flex-end";
  }
  if (value === "between") {
    return "space-between";
  }
  if (value === "around") {
    return "space-around";
  }
  if (value === "evenly") {
    return "space-evenly";
  }
  return value;
};

export const getCssChildAlign = (value: boolean | string): string => {
  if (value === true || value === "true" || value === "") {
    return "center";
  }
  if (value === false || value === "false" || value === "start") {
    return "flex-start";
  }
  if (value === "end") {
    return "flex-end";
  }
  return value;
};

export const isValidNumber = (v: string) => !Number.isNaN(Number(v));

export const getCssZ = (value: string): string => {
  if (isValidNumber(value) || value.startsWith("var(")) {
    return value;
  }
  return `var(---theme-z-index-${value})`;
};

export const getCssValueWithUnit = (
  value: string | number,
  defaultUnit: string
): string => {
  if (typeof value === "number") {
    return `${value}${defaultUnit}`;
  }
  if (value.includes(",")) {
    return value
      .split(",")
      .map((part) => (isValidNumber(part) ? `${part}${defaultUnit}` : part))
      .join(",");
  } else {
    return value
      .split(WHITESPACE_REGEX)
      .map((part) => (isValidNumber(part) ? `${part}${defaultUnit}` : part))
      .join(" ");
  }
};

export const getCssProperty = (value: string): string => {
  return value
    .split(",")
    .map((part) => SPARKLE_TO_CSS_NAME_MAP[part] ?? part)
    .join(",");
};

export const getCssTextWhitespace = (value: string): string => {
  if (value === "") {
    return "normal";
  }
  return value;
};

export const getCssTextWeight = (value: string): string => {
  if (value === "thin") {
    return "100";
  }
  if (value === "extralight") {
    return "200";
  }
  if (value === "light") {
    return "300";
  }
  if (value === "normal") {
    return "400";
  }
  if (value === "medium") {
    return "500";
  }
  if (value === "semibold") {
    return "600";
  }
  if (value === "bold") {
    return "700";
  }
  if (value === "extrabold") {
    return "800";
  }
  if (value === "black") {
    return "900";
  }
  return value;
};

export const getCssTextDecorationLine = (value: boolean | string): string => {
  if (value === true || value === "true" || value === "") {
    return "underline";
  }
  if (value === false || value === "false" || !value) {
    return "";
  }
  if (value === "strikethrough") {
    return "line-through";
  }
  return value;
};

export const getCssTextStroke = (value: string): string => {
  const [width, color] = value.trim().split(WHITESPACE_REGEX);
  const widthMatch = width?.match(VALUE_UNIT_REGEX);
  const widthValue = widthMatch?.[1] || "";
  const widthUnit = widthMatch?.[2] || "";
  let r = isValidNumber(widthValue) ? Number(widthValue) : 1;
  let u = widthUnit || "px";
  let c = color || "black";
  if (r === 0) {
    return "none";
  }
  const n = Math.ceil(2 * Math.PI * r); /* number of shadows */
  let str = "";
  for (let i = 0; i < n; i += 1) {
    const theta = (2 * Math.PI * i) / n;
    str += `${r * Math.cos(theta)}${u} ${r * Math.sin(theta)}${u} 0 ${c}${
      i === n - 1 ? "" : ","
    }`;
  }
  return str;
};

export const getCssTextSize = (value: string): string => {
  if (
    value === "2xs" ||
    value === "xs" ||
    value === "sm" ||
    value === "md" ||
    value === "lg" ||
    value === "xl" ||
    value === "2xl" ||
    value === "3xl" ||
    value === "4xl" ||
    value === "5xl" ||
    value === "6xl" ||
    value === "7xl" ||
    value === "8xl" ||
    value === "9xl"
  ) {
    return `var(---theme-text-${value}-font-size)`;
  }
  if (!Number.isNaN(Number(value))) {
    return `${value}px`;
  }
  return value;
};

export const getCssTextLeading = (value: string): string => {
  if (
    value === "none" ||
    value === "xs" ||
    value === "sm" ||
    value === "md" ||
    value === "lg" ||
    value === "xl"
  ) {
    return `var(---theme-text-leading-${value})`;
  }
  return value;
};

export const getCssTextStyle = (value: boolean | string): string => {
  if (value === true || value === "true" || value === "") {
    return "italic";
  }
  if (value === false || value === "false") {
    return "normal";
  }
  return value;
};

export const getCssTextFont = (value: string): string => {
  if (value === "sans" || value === "serif" || value === "mono") {
    return `var(---theme-font-${value})`;
  }
  return value;
};

export const getCssTextAlign = (value: string): string => {
  if (value === "") {
    return "center";
  }
  return value;
};

export const getCssSkew = (value: string): string => {
  if (value === "none") {
    return "0";
  }
  return value;
};

export const getCssContainIntrinsicSize = (size: string): string => {
  return size;
};

export const getCssContentVisibility = (size: string): string => {
  return size;
};

export const getCssCorner = (value: string): string => {
  if (value === "full" || value === "pill") {
    return "9999px";
  }
  if (value === "circle") {
    return "50%";
  }
  return getCssSize(value);
};

export const getCssDimension = (value: number | string): string => {
  if (value === -1 || value === "") {
    return "100%";
  }
  if (value === "none" || value === "auto") {
    return value;
  }
  return getCssSize(value, "px");
};

export const getCssDisplay = (value: string | boolean): string => {
  if (
    value === true ||
    value === "true" ||
    value === "" ||
    value === "display"
  ) {
    return "flex";
  }
  if (value === false || value === "false") {
    return "none";
  }
  return value;
};

export const getCssDuration = (
  value: string | null,
  defaultValue = "0s"
): string => {
  if (!value) {
    return defaultValue;
  }
  return getCssValueWithUnit(value, "s");
};

export const getCssEase = (
  value: string | null,
  defaultValue = "linear"
): string => {
  if (!value) {
    return defaultValue;
  }
  if (
    value === "none" ||
    value === "linear" ||
    value === "ease" ||
    value === "ease-in" ||
    value === "ease-out" ||
    value === "ease-in-out" ||
    value === "step-start" ||
    value === "step-end" ||
    value.startsWith("var(") ||
    value.startsWith("cubic-bezier(") ||
    value.startsWith("steps(")
  ) {
    return value;
  }
  const [ease, outgoing, incoming] = value.split("-");
  const outgoingPercent = Number(outgoing);
  const incomingPercent = Number(incoming);
  if (
    ease === "ease" &&
    !Number.isNaN(outgoingPercent) &&
    !Number.isNaN(incomingPercent)
  ) {
    const x1 = outgoingPercent / 100;
    const x2 = 1 - incomingPercent / 100;
    return `cubic-bezier(${x1}, 0, ${x2}, 1)`;
  }
  return `var(---theme-easing-${value})`;
};

export const getCssFilter = (value: string): string => {
  if (
    value.startsWith("blur(") ||
    value.startsWith("brightness(") ||
    value.startsWith("contrast(") ||
    value.startsWith("drop-shadow(") ||
    value.startsWith("grayscale(") ||
    value.startsWith("hue-rotate(") ||
    value.startsWith("invert(") ||
    value.startsWith("opacity(") ||
    value.startsWith("sepia(") ||
    value.startsWith("saturate(")
  ) {
    return value;
  }
  return `var(---theme-filter-${value})`;
};

export const getCssFlex = (value: boolean | string): string => {
  if (value === "") {
    return "1";
  }
  if (value === true || value === "true") {
    return "1";
  }
  if (value === false || value === "false" || value === "none") {
    return "0";
  }
  return value;
};

export const getCssGradient = (value: string): string => {
  if (!value) {
    return "none";
  }
  if (
    value === "none" ||
    value.startsWith("var(") ||
    value.startsWith("linear-gradient(") ||
    value.startsWith("radial-gradient(") ||
    value.startsWith("conic-gradient(")
  ) {
    return value;
  }
  return `var(---theme-gradient-${value})`;
};

export const getCssGrow = (value: boolean | string): string => {
  if (value === "") {
    return "1";
  }
  if (value === true || value === "true") {
    return "1";
  }
  if (value === false || value === "false" || value === "none") {
    return "0";
  }
  return value;
};

export const getCssIcon = (value: string): string => {
  if (!value || value === "none") {
    return "none";
  }
  if (value.startsWith("var(") || value.startsWith("url(")) {
    return value;
  }
  return `'${value}'`;
};

export const getCssImage = (value: string): string => {
  if (!value) {
    return "none";
  }
  if (
    value === "none" ||
    value.startsWith("var(") ||
    value.startsWith("url(")
  ) {
    return value;
  }
  return `var(---theme-image-${value})`;
};

export const getCssVisible = (value: boolean | string): string => {
  if (value === true || value === "true" || value === "") {
    return "visible";
  }
  if (value === false || value === "false") {
    return "hidden";
  }
  return value;
};

export const getCssMask = (value: string): string => {
  return `var(---theme-mask-${value})`;
};

export const getCssInteractable = (value: boolean | string): string => {
  if (
    value === true ||
    value === "true" ||
    value === "" ||
    value === "interactable"
  ) {
    return "auto";
  }
  if (value === false || value === "false") {
    return "none";
  }
  return value;
};

export const getCssOrder = (value: string): string => {
  if (value === "" || value === "none") {
    return "0";
  }
  if (value === "first") {
    return "calc(-infinity)";
  }
  if (value === "last") {
    return "calc(infinity)";
  }
  return value;
};

export const getCssOutlineStyle = (value: string): string => {
  if (value === "") {
    return "solid";
  }
  return value;
};

export const getCssOverflow = (value: boolean | string): string => {
  if (
    value === true ||
    value === "true" ||
    value === "" ||
    value === "overflow"
  ) {
    return "visible";
  }
  if (value === false || value === "false") {
    return "clip";
  }
  return value;
};

export const getCssPosition = (value: string): string => {
  if (value === "default") {
    return "static";
  }
  if (value.startsWith("sticky-")) {
    return "sticky";
  }
  if (value.startsWith("fixed-")) {
    return "fixed";
  }
  return value;
};

export const getCssPattern = (value: string): string => {
  if (!value || value === "none") {
    return "none";
  }
  if (value.startsWith("var(") || value.startsWith("url(")) {
    return value;
  }
  return `'${value}'`;
};

export const getCssProportion = (
  value: string | null,
  defaultValue: number,
  emptyValue = defaultValue
): number => {
  if (value === "") {
    return emptyValue;
  }
  if (value == null) {
    return defaultValue;
  }
  let v = value.trim();
  if (v.endsWith("%")) {
    return Number(v.slice(0, -1)) / 100;
  }
  return Number(v);
};

export const getCssRatio = (value: string): string => {
  if (value === "") {
    return "1";
  }
  if (value.includes("/")) {
    return value;
  }
  if (value.includes(":")) {
    return value.replace(":", "/");
  }
  return `var(---theme-ratio-${value})`;
};

export const getCssRepeat = (value: boolean | string): string => {
  if (value === true || value === "true") {
    return "repeat";
  }
  if (
    value === false ||
    value === "false" ||
    value === "none" ||
    value === "norepeat"
  ) {
    return "no-repeat";
  }
  if (value === "x") {
    return "repeat-x";
  }
  if (value === "y") {
    return "repeat-y";
  }
  return value;
};

export const getCssGlow = (value: string): string => {
  if (value === "none") {
    return value;
  }
  const [width, color] = value.split(WHITESPACE_REGEX);
  return `0 0 ${getCssSize(width ?? 2)} 0 ${getCssColor(
    color ?? "currentColor"
  )}`;
};

export const getCssRing = (value: string): string => {
  if (value === "none") {
    return value;
  }
  const [width, color] = value.split(WHITESPACE_REGEX);
  return `0 0 0 ${getCssSize(width ?? 2)} ${getCssColor(
    color ?? "currentColor"
  )}`;
};

export const getCssRotate = (value: string): string => {
  if (value === "none") {
    return "0";
  }
  return getCssValueWithUnit(value, "deg");
};

export const getCssScale = (value: string): string => {
  if (value === "none") {
    return "1";
  }
  return value;
};

export const getCssSelectable = (value: boolean | string): string => {
  if (
    value === true ||
    value === "true" ||
    value === "" ||
    value === "selectable"
  ) {
    return "auto";
  }
  if (value === false || value === "false") {
    return "none";
  }
  return value;
};

export const getCssShadow = (value: string): string => {
  if (value === "none") {
    return value;
  }
  const isValidNumber = !Number.isNaN(Number(value));
  if (isValidNumber) {
    return generateShadow(Number(value));
  }
  return value;
};

export const getCssShadowInset = (value: string): string => {
  const isValidNumber = !Number.isNaN(Number(value));
  if (isValidNumber) {
    return `var(---theme-shadow-inset-${value})`;
  }
  return value;
};

export const getCssShrink = (value: boolean | string): string => {
  if (value === "") {
    return "1";
  }
  if (value === true || value === "true") {
    return "1";
  }
  if (value === false || value === "false" || value === "none") {
    return "0";
  }
  return value;
};

export const getCssBasis = (value: boolean | string): string => {
  if (value === "") {
    return "0";
  }
  if (value === true || value === "true") {
    return "0";
  }
  if (value === false || value === "false" || value === "none") {
    return "auto";
  }
  return value;
};

export const isNumberChar = (c: string | undefined): boolean =>
  !Number.isNaN(Number(c));

export const isVariableValue = (
  value: string | number | undefined
): boolean => {
  if (typeof value === "number") {
    return false;
  }
  if (!value) {
    return false;
  }
  if (value[0] === "-") {
    return false;
  }
  if (isNumberChar(value[0])) {
    return false;
  }
  return true;
};

export const getCssSize = (
  value: string | number,
  defaultUnit: "px" | "rem" = "px"
): string => {
  if (value === "none") {
    return "0";
  }
  if (value === "") {
    return defaultUnit === "px" ? "8px" : "0.5rem";
  }
  if (value === "xs") {
    return defaultUnit === "px" ? "2px" : "0.125rem";
  }
  if (value === "sm") {
    return defaultUnit === "px" ? "4px" : "0.25rem";
  }
  if (value === "md") {
    return defaultUnit === "px" ? "8px" : "0.5rem";
  }
  if (value === "lg") {
    return defaultUnit === "px" ? "16px" : "1rem";
  }
  if (value === "xl") {
    return defaultUnit === "px" ? "24px" : "1.5rem";
  }
  if (isVariableValue(value)) {
    return `var(---theme-size-${value})`;
  }
  return getCssValueWithUnit(value, defaultUnit);
};

export const getCssTextOverflow = (value: string): string => {
  if (value === "" || value === "wrap") {
    return "clip";
  }
  return value;
};

export const getCssTranslate = (value: string): string => {
  if (value === "none") {
    return "0";
  }
  return getCssValueWithUnit(value, "px");
};

export const getCssIterations = (value: string | number): string => {
  if (value === Infinity) {
    return "infinite";
  }
  return String(value);
};

export function generateShadow(elevation: number): string {
  const shadowColorRgb = "0,0,0";
  const keyShadowOpacity = 0.3;
  const ambientShadowOpacity = 0.15;

  // --- Key Shadow Calculations ---
  const keyL1y = Math.max(0, Math.min(elevation, 1));
  const keyL4y = Math.max(0, Math.min(elevation - 3, 1));
  const keyL5y = 2 * Math.max(0, Math.min(elevation - 4, 1));
  const keyOffsetY = keyL1y + keyL4y + keyL5y;

  // Blur Radius for Key Shadow
  const keyL1Blur = 2 * Math.max(0, Math.min(elevation, 1));
  const keyL3Blur = Math.max(0, Math.min(elevation - 2, 1));
  const keyL5Blur = Math.max(0, Math.min(elevation - 4, 1));
  const keyBlurRadius = keyL1Blur + keyL3Blur + keyL5Blur;

  // Spread Radius for Key Shadow is 0px
  const keySpreadRadius = 0;

  // --- Ambient Shadow Calculations --
  const ambL1y = Math.max(0, Math.min(elevation, 1));
  const ambL2y = Math.max(0, Math.min(elevation - 1, 1));
  const ambL3to5y = 2 * Math.max(0, Math.min(elevation - 2, 3));
  const ambientOffsetY = ambL1y + ambL2y + ambL3to5y;

  // Blur Radius for Ambient Shadow
  const ambL1to2Blur = 3 * Math.max(0, Math.min(elevation, 2));
  const ambL3to5Blur = 2 * Math.max(0, Math.min(elevation - 2, 3));
  const ambientBlurRadius = ambL1to2Blur + ambL3to5Blur;

  // Spread Radius for Ambient Shadow
  const ambL1to4Spread = Math.max(0, Math.min(elevation, 4));
  const ambL5Spread = 2 * Math.max(0, Math.min(elevation - 4, 1));
  const ambientSpreadRadius = ambL1to4Spread + ambL5Spread;

  // If all calculated metrics that define a shadow are zero, return 'none'.
  if (
    keyOffsetY === 0 &&
    keyBlurRadius === 0 &&
    keySpreadRadius === 0 && // keySpreadRadius is always 0 in this specific model
    ambientOffsetY === 0 &&
    ambientBlurRadius === 0 &&
    ambientSpreadRadius === 0
  ) {
    return "none";
  }

  const keyShadowCssColor = `rgba(${shadowColorRgb}, ${keyShadowOpacity})`;
  const keyShadowString = `0px ${keyOffsetY}px ${keyBlurRadius}px ${keySpreadRadius}px ${keyShadowCssColor}`;

  const ambientShadowCssColor = `rgba(${shadowColorRgb}, ${ambientShadowOpacity})`;
  const ambientShadowString = `0px ${ambientOffsetY}px ${ambientBlurRadius}px ${ambientSpreadRadius}px ${ambientShadowCssColor}`;

  return `${keyShadowString}, ${ambientShadowString}`;
}
