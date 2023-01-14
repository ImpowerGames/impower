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
  _objectMap?: { [type: string]: Record<string, any> }
): [string, string] => {
  const cssProp = getCSSPropertyName(name);
  if (value == null || value === "") {
    return [cssProp, ""];
  }
  if (cssProp === "background-image" && typeof value === "string") {
    const url = value.trim().startsWith("url(")
      ? value
      : `url('${encodeURI(value)}')`;
    return [cssProp, url];
  }
  if (cssProp === "text-stroke") {
    if (typeof value === "number") {
      return ["text-shadow", createTextShadow(value)];
    }
    if (typeof value === "string") {
      const parts = value.split(" ");
      const r = parts[0]?.replace(/[^0-9.]+/g, "") || "";
      const num = Number.parseInt(r, 16);
      if (!Number.isNaN(num)) {
        return ["text-shadow", createTextShadow(num, parts[1])];
      }
    }
  }
  if (cssProp === "line-height") {
    return [cssProp, String(value)];
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
    if (Array.isArray(value)) {
      return [
        cssProp,
        value.map((x) => (typeof x === "number" ? `${x}px` : x)).join(" "),
      ];
    }
    if (typeof value === "number") {
      return [cssProp, `${value}px`];
    }
  }
  return [cssProp, String(value)];
};
