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
  value: unknown,
  typeMap?: { [type: string]: Record<string, any> }
): [string, string] => {
  const theme = typeMap?.["theme"]?.[""];
  const cssProp = getCSSPropertyName(name);
  const cssValue = value;
  if (cssValue == null || cssValue === "") {
    return [cssProp, ""];
  }
  if (
    cssProp === "background-color" &&
    typeof cssValue === "string" &&
    theme?.colors[cssValue]
  ) {
    return [cssProp, theme.colors[cssValue]];
  }
  if (cssProp === "background-image" && typeof cssValue === "string") {
    const src = cssValue.trim();
    const url = /^[ ]*url[ ]*[(]/.test(src) ? src : `url('${encodeURI(src)}')`;
    return [cssProp, url];
  }
  if (
    cssProp === "background-image" &&
    typeof cssValue === "object" &&
    "src" in cssValue &&
    typeof cssValue.src === "string"
  ) {
    const src = cssValue.src.trim();
    const url = /^[ ]*url[ ]*[(]/.test(src) ? src : `url('${encodeURI(src)}')`;
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
