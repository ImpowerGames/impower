import { getCSSPropertyName } from "./getCSSPropertyName";

const createTextShadow = (r: number, color = "black"): string => {
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
  if (cssProp === "text-stroke") {
    if (typeof cssValue === "number") {
      return ["text-shadow", createTextShadow(cssValue)];
    }
    if (typeof cssValue === "string") {
      const parts = cssValue.split(" ");
      const r = parts[0]?.replace(/[^0-9.]+/g, "") || "";
      const num = Number.parseInt(r, 16);
      if (!Number.isNaN(num)) {
        return ["text-shadow", createTextShadow(num, parts[1])];
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
