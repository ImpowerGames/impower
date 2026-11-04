import { SPARKLE_TO_CSS_NAME_MAP } from "../constants/CSS_ALIASES.js";
import type { ThemeVariables } from "../types/themeVariables.js";
import {
  applyEdits,
  identName,
  isFunctionNode,
  isTokenType,
  parseComponentValues,
  significant,
  splitAt,
  TokenType,
  type ComponentValue,
  type FunctionNode,
  type SourceEdit,
  type TokenNode,
} from "./cssSyntax.js";

const WHITESPACE_REGEX = /[\t ]+/;
const VALUE_UNIT_REGEX = /^(\d+(?:\.\d+)?)([a-z]+)?$/;

export const getThemeVar = (
  theme: ThemeVariables,
  category: string,
  name: string,
): string | undefined => {
  const variable = `--theme-${category}-${name}`;
  return theme.has(variable) ? `var(${variable})` : undefined;
};

// eslint-disable-next-line no-useless-escape
const SAFE_CSS_VALUE_RE =
  /^(?:url\([^)]*\)|var\(.*\)|(?:rgb|rgba|hsl|hsla|lch)\([^)]*\)|(?:linear-gradient|radial-gradient|conic-gradient|repeating-linear-gradient|repeating-radial-gradient|repeating-conic-gradient)\([^)]*\)|#[0-9a-f]{3,8}|[a-z0-9_-]+(?:\s+[a-z0-9_-]+)*|[0-9.+-]+(?:deg|px|rem|em|%|vh|vw|vmin|vmax)?)$/i;

export function validateCss(value: string | null | undefined): boolean {
  if (value == null) {
    return true;
  }
  const v = String(value)?.trim() ?? "";
  return SAFE_CSS_VALUE_RE.test(v);
}

const GRADIENT_FUNCTION = /^(?:repeating-)?(linear|radial|conic)-gradient$/i;

const COLOR_FUNCTION = /^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)$/i;

const COLOR_ARGUMENT_FUNCTION = /^(?:drop-shadow|light-dark)$/i;

const GRADIENT_SETUP_WORDS: Record<string, ReadonlySet<string>> = {
  linear: new Set(["to", "in"]),
  radial: new Set([
    "in",
    "at",
    "circle",
    "ellipse",
    "closest-side",
    "closest-corner",
    "farthest-side",
    "farthest-corner",
  ]),
  conic: new Set(["in", "from", "at"]),
};

type ArgumentKind = "setup" | "colors" | "unknown";

const isNumeric = (node: ComponentValue | undefined): boolean =>
  isTokenType(node, TokenType.Number) ||
  isTokenType(node, TokenType.Dimension) ||
  isTokenType(node, TokenType.Percentage);

const MATH_FUNCTION =
  /^(?:calc|min|max|clamp|round|mod|rem|abs|sign|sin|cos|tan|asin|acos|atan|atan2|pow|sqrt|hypot|log|exp)$/i;

const classifyGradientFirstArgument = (
  kind: string,
  argument: ComponentValue[],
): ArgumentKind => {
  const values = significant(argument);
  const first = values[0];
  if (isNumeric(first)) {
    return "setup";
  }
  if (isFunctionNode(first) && MATH_FUNCTION.test(first.getName())) {
    return "setup";
  }
  const words = GRADIENT_SETUP_WORDS[kind];
  const hasSetupWord = values.some((value) => {
    const word = identName(value)?.toLowerCase();
    return word !== undefined && !!words?.has(word);
  });
  if (hasSetupWord) {
    return "setup";
  }
  if (isFunctionNode(first) && first.getName().toLowerCase() === "var") {
    return "unknown";
  }
  return "colors";
};

const resolveColorWords = (
  css: string,
  nodes: ComponentValue[],
  theme: ThemeVariables,
  edits: SourceEdit[],
): void => {
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i]!;
    if (isFunctionNode(node)) {
      resolveFunction(css, node, theme, edits, true);
      continue;
    }
    const name = identName(node);
    if (name === undefined || name.startsWith("--")) {
      continue;
    }
    const [, , start, end] = (node as TokenNode).value;
    const slash = nodes[i + 1];
    const alpha = nodes[i + 2];
    if (
      isTokenType(slash, TokenType.Delim) &&
      slash.value[1] === "/" &&
      slash.value[2] === end + 1 &&
      isNumeric(alpha) &&
      (alpha as TokenNode).value[2] === slash.value[3] + 1
    ) {
      const alphaEnd = (alpha as TokenNode).value[3];
      const origin =
        getThemeVar(theme, "color", name) ?? css.slice(start, end + 1);
      const alphaText = css.slice(slash.value[3] + 1, alphaEnd + 1);
      edits.push({
        start,
        end: alphaEnd + 1,
        text: `rgb(from ${origin} r g b / ${alphaText})`,
      });
      i += 2;
      continue;
    }
    const resolved =
      name === "current" ? "currentColor" : getThemeVar(theme, "color", name);
    if (resolved !== undefined) {
      edits.push({ start, end: end + 1, text: resolved });
    }
  }
};

const resolveNestedFunctions = (
  css: string,
  nodes: ComponentValue[],
  theme: ThemeVariables,
  edits: SourceEdit[],
): void => {
  for (const node of nodes) {
    if (isFunctionNode(node)) {
      resolveFunction(css, node, theme, edits, false);
    }
  }
};

const resolveFunction = (
  css: string,
  fn: FunctionNode,
  theme: ThemeVariables,
  edits: SourceEdit[],
  colorPosition: boolean,
): void => {
  const name = fn.getName();
  if (COLOR_FUNCTION.test(name)) {
    const args = significant(fn.value);
    if (identName(args[0])?.toLowerCase() === "from" && args[1]) {
      resolveColorWords(css, [args[1]], theme, edits);
    }
    return;
  }
  const gradientKind = name.match(GRADIENT_FUNCTION)?.[1]?.toLowerCase();
  const colorMix = name.toLowerCase() === "color-mix";
  if (gradientKind || colorMix) {
    splitAt(fn.value, TokenType.Comma).forEach((argument, index) => {
      const kind: ArgumentKind =
        index > 0
          ? "colors"
          : colorMix
            ? "setup"
            : classifyGradientFirstArgument(gradientKind!, argument);
      if (kind === "colors") {
        resolveColorWords(css, argument, theme, edits);
      } else {
        resolveNestedFunctions(css, argument, theme, edits);
      }
    });
    return;
  }
  if (name.toLowerCase() === "var") {
    splitAt(fn.value, TokenType.Comma).forEach((argument, index) => {
      if (index > 0 && colorPosition) {
        resolveColorWords(css, argument, theme, edits);
      } else if (index > 0) {
        resolveNestedFunctions(css, argument, theme, edits);
      }
    });
    return;
  }
  if (COLOR_ARGUMENT_FUNCTION.test(name)) {
    resolveColorWords(css, fn.value, theme, edits);
    return;
  }
  resolveNestedFunctions(css, fn.value, theme, edits);
};

function transformColors(
  css: string,
  theme: ThemeVariables,
  colorPosition: boolean,
): string {
  const edits: SourceEdit[] = [];
  const values = parseComponentValues(css);
  if (colorPosition) {
    resolveColorWords(css, values, theme, edits);
  } else {
    resolveNestedFunctions(css, values, theme, edits);
  }
  return applyEdits(css, edits);
}

export const getCssAnchorVisibility = (value: string | boolean): string => {
  if (value === true || value === "true" || value === "") {
    return "always";
  }
  if (value === "valid") {
    return "anchors-valid";
  }
  if (value === "visible") {
    return "anchors-visible";
  }
  if (value === false || value === "false") {
    return "no-overflow";
  }
  return value;
};

export const getCssAnimation = (
  value: string | null,
  theme: ThemeVariables,
  suffix = "",
): string => {
  if (!value) {
    return "none";
  }
  if (value.startsWith("var(")) {
    return value;
  }
  const names = value.split(" ");
  const variables = names.map((v) =>
    getThemeVar(theme, "animation", `${v}${suffix}`),
  );
  if (variables.every((v) => v === undefined)) {
    return value;
  }
  return names.map((v, i) => variables[i] ?? v).join(", ");
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

export const getCssColor = (value: string, theme: ThemeVariables): string =>
  value ? transformColors(value, theme, true) : value;

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

export const getCssZ = (value: string, theme: ThemeVariables): string => {
  if (isValidNumber(value) || value.startsWith("var(")) {
    return value;
  }
  return getThemeVar(theme, "z-index", value) ?? value;
};

const withUnitOutsideFunctions = (parts: string[], unit: string): string[] => {
  let depth = 0;
  return parts.map((part) => {
    const insideFunction = depth > 0;
    for (const char of part) {
      if (char === "(") {
        depth += 1;
      } else if (char === ")") {
        depth -= 1;
      }
    }
    return !insideFunction && isValidNumber(part) ? `${part}${unit}` : part;
  });
};

export const getCssValueWithUnit = (
  value: string | number,
  defaultUnit: string,
): string => {
  if (typeof value === "number") {
    return `${value}${defaultUnit}`;
  }
  if (value.includes(",")) {
    return withUnitOutsideFunctions(value.split(","), defaultUnit).join(",");
  } else {
    return withUnitOutsideFunctions(
      value.split(WHITESPACE_REGEX),
      defaultUnit,
    ).join(" ");
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

export const getCssTextStroke = (
  value: string,
  theme: ThemeVariables,
): string => {
  const [width, color] = value.trim().split(WHITESPACE_REGEX);
  const widthMatch = width?.match(VALUE_UNIT_REGEX);
  const widthValue = widthMatch?.[1] || "";
  const widthUnit = widthMatch?.[2] || "";
  let r = isValidNumber(widthValue) ? Number(widthValue) : 1;
  let u = widthUnit || "px";
  let c = getCssColor(color || "black", theme);
  if (r === 0) {
    return "none";
  }
  const n = Math.ceil(2 * Math.PI * r);
  let str = "";
  for (let i = 0; i < n; i += 1) {
    const theta = (2 * Math.PI * i) / n;
    str += `${r * Math.cos(theta)}${u} ${r * Math.sin(theta)}${u} 0 ${c}${
      i === n - 1 ? "" : ","
    }`;
  }
  return str;
};

export const getCssTextSize = (
  value: string,
  theme: ThemeVariables,
): string => {
  if (value.startsWith("var(")) {
    return value;
  }
  if (!Number.isNaN(Number(value))) {
    return `${value}px`;
  }
  return getThemeVar(theme, "text", `${value}-font-size`) ?? value;
};

export const getCssTextLeading = (
  value: string,
  theme: ThemeVariables,
): string => {
  if (value.startsWith("var(")) {
    return value;
  }
  return getThemeVar(theme, "text-leading", value) ?? value;
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

export const getCssTextFont = (
  value: string,
  theme: ThemeVariables,
): string => {
  if (value.startsWith("var(")) {
    return value;
  }
  return getThemeVar(theme, "font", value) ?? value;
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

export const getCssCorner = (value: string, theme: ThemeVariables): string => {
  if (value === "full" || value === "pill") {
    return "9999px";
  }
  if (value === "circle") {
    return "50%";
  }
  return getCssSize(value, theme);
};

export const getCssDimension = (
  value: number | string,
  theme: ThemeVariables,
): string => {
  if (value === -1 || value === "") {
    return "100%";
  }
  if (value === "none") {
    return value;
  }
  return getCssSize(value, theme);
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
  defaultValue = "0s",
): string => {
  if (!value) {
    return defaultValue;
  }
  return getCssValueWithUnit(value, "s");
};

export const getCssEase = (
  value: string | null,
  theme: ThemeVariables,
  defaultValue = "linear",
): string => {
  if (!value) {
    return defaultValue;
  }
  if (value.includes("(")) {
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
  return getThemeVar(theme, "ease", value) ?? value;
};

export const getCssFilter = (value: string, theme: ThemeVariables): string => {
  if (value.includes("(")) {
    return transformColors(value, theme, false);
  }
  return getThemeVar(theme, "filter", value) ?? value;
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

export const getCssGradient = (
  value: string,
  theme: ThemeVariables,
): string => {
  if (!value) {
    return "none";
  }
  if (value.includes("(")) {
    return transformColors(value, theme, false);
  }
  return getThemeVar(theme, "gradient", value) ?? value;
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

export const getCssImage = (value: string, theme: ThemeVariables): string => {
  if (!value) {
    return "none";
  }
  if (value.includes("(")) {
    return transformColors(value, theme, false);
  }
  return getThemeVar(theme, "image", value) ?? value;
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

export const getCssMask = (value: string, theme: ThemeVariables): string => {
  if (value.startsWith("var(")) {
    return value;
  }
  return getThemeVar(theme, "mask", value) ?? value;
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
  return `'${value}'`;
};

export const getCssProportion = (
  value: string | null,
  defaultValue: number,
  emptyValue = defaultValue,
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

export const getCssRatio = (value: string, theme: ThemeVariables): string => {
  if (value === "") {
    return "1";
  }
  if (value.includes("/")) {
    return value;
  }
  if (value.includes(":")) {
    return value.replace(":", "/");
  }
  if (value.startsWith("var(")) {
    return value;
  }
  return getThemeVar(theme, "ratio", value) ?? value;
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

export const getCssGlow = (value: string, theme: ThemeVariables): string => {
  if (value === "none") {
    return value;
  }
  const [width, color] = value.split(WHITESPACE_REGEX);
  return `0 0 ${getCssSize(width ?? 2, theme)} 0 ${getCssColor(
    color ?? "currentColor",
    theme,
  )}`;
};

export const getCssRing = (value: string, theme: ThemeVariables): string => {
  if (value === "none") {
    return value;
  }
  const [width, color] = value.split(WHITESPACE_REGEX);
  return `0 0 0 ${getCssSize(width ?? 2, theme)} ${getCssColor(
    color ?? "currentColor",
    theme,
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

export const getCssShadowInset = (
  value: string,
  theme: ThemeVariables,
): string => {
  if (value.startsWith("var(")) {
    return value;
  }
  return getThemeVar(theme, "shadow-inset", value) ?? value;
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

export const getCssSize = (
  value: string | number,
  theme: ThemeVariables,
  defaultUnit: "px" | "rem" = "px",
): string => {
  if (value === "none") {
    return "0";
  }
  if (value === "") {
    return defaultUnit === "px" ? "8px" : "0.5rem";
  }
  if (
    typeof value === "string" &&
    WHITESPACE_REGEX.test(value.trim()) &&
    !value.includes("(") &&
    !value.includes(",")
  ) {
    return value
      .trim()
      .split(WHITESPACE_REGEX)
      .map((part) =>
        part === "/" ? part : getCssSize(part, theme, defaultUnit),
      )
      .join(" ");
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
  if (value === "top") {
    return "anchor(top)";
  }
  if (value === "bottom") {
    return "anchor(bottom)";
  }
  if (value === "left") {
    return "anchor(left)";
  }
  if (value === "right") {
    return "anchor(right)";
  }
  if (value === "center") {
    return "anchor(center)";
  }
  if (value === "inside") {
    return "anchor(inside)";
  }
  if (value === "outside") {
    return "anchor(outside)";
  }
  if (value === "start") {
    return "anchor(start)";
  }
  if (value === "end") {
    return "anchor(end)";
  }
  if (value === "self-start") {
    return "anchor(self-start)";
  }
  if (value === "self-end") {
    return "anchor(self-end)";
  }
  if (typeof value === "string" && value.startsWith("var(")) {
    return value;
  }
  const themeVar =
    typeof value === "string" && !isValidNumber(value)
      ? getThemeVar(theme, "size", value)
      : undefined;
  return themeVar ?? getCssValueWithUnit(value, defaultUnit);
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

  const keyL1y = Math.max(0, Math.min(elevation, 1));
  const keyL4y = Math.max(0, Math.min(elevation - 3, 1));
  const keyL5y = 2 * Math.max(0, Math.min(elevation - 4, 1));
  const keyOffsetY = keyL1y + keyL4y + keyL5y;

  const keyL1Blur = 2 * Math.max(0, Math.min(elevation, 1));
  const keyL3Blur = Math.max(0, Math.min(elevation - 2, 1));
  const keyL5Blur = Math.max(0, Math.min(elevation - 4, 1));
  const keyBlurRadius = keyL1Blur + keyL3Blur + keyL5Blur;

  const keySpreadRadius = 0;

  const ambL1y = Math.max(0, Math.min(elevation, 1));
  const ambL2y = Math.max(0, Math.min(elevation - 1, 1));
  const ambL3to5y = 2 * Math.max(0, Math.min(elevation - 2, 3));
  const ambientOffsetY = ambL1y + ambL2y + ambL3to5y;

  const ambL1to2Blur = 3 * Math.max(0, Math.min(elevation, 2));
  const ambL3to5Blur = 2 * Math.max(0, Math.min(elevation - 2, 3));
  const ambientBlurRadius = ambL1to2Blur + ambL3to5Blur;

  const ambL1to4Spread = Math.max(0, Math.min(elevation, 4));
  const ambL5Spread = 2 * Math.max(0, Math.min(elevation - 4, 1));
  const ambientSpreadRadius = ambL1to4Spread + ambL5Spread;

  if (
    keyOffsetY === 0 &&
    keyBlurRadius === 0 &&
    keySpreadRadius === 0 &&
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

const CSS_CONTENT_KEYWORDS = new Set([
  "none",
  "normal",
  "inherit",
  "initial",
  "revert",
  "revert-layer",
  "unset",
  "open-quote",
  "close-quote",
  "no-open-quote",
  "no-close-quote",
]);

const CSS_CONTENT_FUNCTION_REGEX =
  /^(?:attr|url|var|counter|counters|linear-gradient|radial-gradient|conic-gradient|image-set|image)\(/;

export const getCssContent = (value: string): string => {
  const v = value == null ? "" : String(value).trim();
  if (CSS_CONTENT_KEYWORDS.has(v)) {
    return v;
  }
  if (CSS_CONTENT_FUNCTION_REGEX.test(v)) {
    return v;
  }
  if (
    (v.startsWith('"') && v.endsWith('"') && v.length >= 2) ||
    (v.startsWith("'") && v.endsWith("'") && v.length >= 2)
  ) {
    return v;
  }
  return JSON.stringify(v);
};
