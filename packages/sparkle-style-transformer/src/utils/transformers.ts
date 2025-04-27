export const getCssAnimation = (value: string | null, suffix = ""): string => {
  if (!value || value === "none") {
    return "none";
  }
  if (value.startsWith("var(")) {
    return value;
  }
  return value
    .split(" ")
    .map((v) => `var(---theme_animation-${v}${suffix || ""})`)
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
  return `var(---theme_color-${color}, var(---theme_color-${color}-60))`;
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
  if (value === true || value === "") {
    return "center";
  }
  if (value === false || value === "start") {
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
  return `var(---theme_z-index-${value})`;
};

export const getCssUnit = (
  value: string | number,
  defaultUnit: string
): string => {
  if (typeof value === "number") {
    return `${value}${defaultUnit}`;
  }
  return value
    .split(" ")
    .map((part) => (isValidNumber(part) ? `${part}${defaultUnit}` : part))
    .join(" ");
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

export const getCssTextUnderline = (value: string): string => {
  if (value === "") {
    return "underline";
  }
  if (!value) {
    return "";
  }
  return value;
};

export const getCssTextStroke = (
  width: string,
  color = "var(---text-stroke-color, black)"
): string => {
  const r = Number(width);
  if (r === 0) {
    return "none";
  }
  const n = Math.ceil(2 * Math.PI * r); /* number of shadows */
  let str = "";
  for (let i = 0; i < n; i += 1) {
    const theta = (2 * Math.PI * i) / n;
    str += `${r * Math.cos(theta)}px ${r * Math.sin(theta)}px 0 ${color}${
      i === n - 1 ? "" : ","
    }`;
  }
  return str;
};

export const getCssTextStrikethrough = (value: string): string => {
  if (value === "") {
    return "line-through";
  }
  if (!value) {
    return "";
  }
  return value;
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
    return `var(---theme_text-${value}-font-size)`;
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
    return `var(---theme_text-kerning-${value})`;
  }
  return value;
};

export const getCssTextItalic = (value: boolean | string): string => {
  if (value === true || value === "") {
    return "italic";
  }
  if (value === false) {
    return "normal";
  }
  return value;
};

export const getCssTextFont = (value: string): string => {
  if (value === "sans" || value === "serif" || value === "mono") {
    return `var(---theme_font-${value})`;
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

export const getCssDuration = (
  value: string | null,
  defaultValue = "0s"
): string => {
  if (!value) {
    return defaultValue;
  }
  return getCssUnit(value, "s");
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
  return `var(---theme_easing-${value})`;
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
  return `var(---theme_filter-${value})`;
};

export const getCssFlex = (value: boolean | string): string => {
  if (value === "") {
    return "1";
  }
  if (value === true) {
    return "1";
  }
  if (value === false || value === "none") {
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
  return `var(---theme_gradient-${value})`;
};

export const getCssGrow = (value: boolean | string): string => {
  if (value === "") {
    return "1";
  }
  if (value === true) {
    return "1";
  }
  if (value === false || value === "none") {
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
  return `var(---theme_image-${value})`;
};

export const getCssInvisible = (value: boolean | string): string => {
  if (value === true || value === "") {
    return "hidden";
  }
  if (value === false) {
    return "visible";
  }
  return value;
};

export const getCssMask = (value: string): string => {
  return `var(---theme_mask-${value})`;
};

export const getCssInteractable = (value: boolean | string): string => {
  if (value === true || value === "") {
    return "auto";
  }
  if (value === false) {
    return "none";
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
  if (value === true || value === "") {
    return "visible";
  }
  if (value === false) {
    return "clip";
  }
  return value;
};

export const getCssPosition = (value: string): string => {
  if (value === "default") {
    return "static";
  }
  if (value.startsWith("sticky")) {
    return "sticky";
  }
  if (value.startsWith("absolute")) {
    return "absolute";
  }
  if (value.startsWith("fixed")) {
    return "fixed";
  }
  if (value.startsWith("relative")) {
    return "relative";
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
  return `var(---theme_ratio-${value})`;
};

export const getCssRepeat = (value: boolean | string): string => {
  if (value === true) {
    return "repeat";
  }
  if (value === false || value === "none" || value === "norepeat") {
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

export const getCssRotate = (value: string): string => {
  if (value === "none") {
    return "0";
  }
  return getCssUnit(`${value}`, "deg");
};

export const getCssScale = (value: string): string => {
  if (value === "none") {
    return "1";
  }
  return value;
};

export const getCssSelectable = (value: boolean | string): string => {
  if (value === true || value === "") {
    return "auto";
  }
  if (value === false) {
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
    return `var(---theme_shadow-box-${value})`;
  }
  return value;
};

export const getCssShadowInset = (value: string): string => {
  const isValidNumber = !Number.isNaN(Number(value));
  if (isValidNumber) {
    return `var(---theme_shadow-inset-${value})`;
  }
  return value;
};

export const getCssShrink = (value: boolean | string): string => {
  if (value === "") {
    return "1";
  }
  if (value === true) {
    return "1";
  }
  if (value === false || value === "none") {
    return "0";
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
    return `var(---theme_size-${value})`;
  }
  return getCssUnit(value, defaultUnit);
};

export const getCssTextOverflow = (value: string): string => {
  if (value === "" || value === "visible" || value === "wrap") {
    return "clip";
  }
  return value;
};

export const getCssTranslate = (value: string): string => {
  if (value === "none") {
    return "0";
  }
  return getCssUnit(`${value}`, "px");
};
