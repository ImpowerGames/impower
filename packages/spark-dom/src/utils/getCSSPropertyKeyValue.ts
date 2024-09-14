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

export const getCSSPropertyKeyValue = (
  name: string,
  value: unknown
): [string, string] => {
  const cssProp = getCSSPropertyName(name);
  const cssValue = value;
  if (cssValue == null || cssValue === "") {
    return [cssProp, ""];
  }
  if (cssProp === "easing") {
    return ["animation-timing-function", String(cssValue)];
  }
  if (cssProp === "src" && typeof cssValue === "string") {
    const src = cssValue.trim();
    const urlValue = src.includes("(") ? src : `url('${encodeURI(src)}')`;
    return [cssProp, urlValue];
  }
  if (cssProp === "background-image" && typeof cssValue === "string") {
    const src = cssValue.trim();
    const varValue = src.includes("(") ? src : `var(--image_${src})`;
    return [cssProp, varValue];
  }
  if (
    cssProp === "background-image" &&
    typeof cssValue === "object" &&
    "$ref" in cssValue &&
    typeof cssValue.$ref === "string"
  ) {
    const [type, name] = cssValue.$ref.split(".");
    if (type && name) {
      const varValue = `var(--${type}_${name})`;
      return [cssProp, varValue];
    }
  }
  if (
    cssProp === "background-image" &&
    typeof cssValue === "object" &&
    "$type" in cssValue &&
    typeof cssValue.$type === "string" &&
    "$name" in cssValue &&
    typeof cssValue.$name === "string"
  ) {
    const type = cssValue.$type;
    const name = cssValue.$name;
    const varValue = `var(--${type}_${name})`;
    return [cssProp, varValue];
  }
  if (
    cssProp === "background-image" &&
    typeof cssValue === "object" &&
    "src" in cssValue &&
    typeof cssValue.src === "string"
  ) {
    const src = cssValue.src.trim();
    const urlValue = src.includes("(") ? src : `url('${encodeURI(src)}')`;
    return [cssProp, urlValue];
  }
  if (
    cssProp === "background-image" &&
    typeof cssValue === "object" &&
    "data" in cssValue &&
    typeof cssValue.data === "string" &&
    "ext" in cssValue &&
    typeof cssValue.ext === "string"
  ) {
    const data = cssValue.data.trim();
    const ext = cssValue.ext;
    const encoding =
      ext === "svg"
        ? "image/svg+xml;utf8"
        : ext === "png"
        ? "image/png;base64"
        : ext === "jpg" || ext === "jpeg"
        ? "image/jpeg;base64"
        : `image/${ext};base64`;
    const url = data.includes("(")
      ? data
      : `url(data:${encoding},${encodeURIComponent(data)})`;
    return [cssProp, url];
  }
  if (
    cssProp === "font-family" &&
    typeof cssValue === "object" &&
    "$ref" in cssValue &&
    typeof cssValue.$ref === "string"
  ) {
    const [, name] = cssValue.$ref.split(".");
    if (name) {
      return [cssProp, name];
    }
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
    if (typeof cssValue === "number") {
      return ["text-shadow", createTextShadow(cssValue)];
    }
    if (typeof cssValue === "string") {
      const parts = cssValue.split(" ");
      const match = parts[0]?.match(/((?:\d*[.])?\d+)([a-z]+)/);
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
        cssValue.map((x) => (typeof x === "number" ? `${x}px` : x)).join(" "),
      ];
    }
    if (typeof cssValue === "number") {
      return [cssProp, `${cssValue}px`];
    }
  }
  if (typeof cssValue === "object") {
    return [cssProp, ""];
  }
  return [cssProp, String(cssValue)];
};
