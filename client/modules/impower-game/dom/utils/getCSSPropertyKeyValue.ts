import { getCSSPropertyName } from "./getCSSPropertyName";

const getTextShadow = (r: number, color = "black"): string => {
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
  if (cssProp === "background-image") {
    return [cssProp, `url('${value}')`];
  }
  if (
    cssProp === "width" ||
    cssProp === "height" ||
    cssProp === "top" ||
    cssProp === "bottom" ||
    cssProp === "left" ||
    cssProp === "right" ||
    cssProp.endsWith("-width") ||
    cssProp.endsWith("-height") ||
    cssProp.endsWith("-top") ||
    cssProp.endsWith("-bottom") ||
    cssProp.endsWith("-left") ||
    cssProp.endsWith("-right")
  ) {
    if (typeof value === "number") {
      return [cssProp, `${value}px`];
    }
  }
  if (cssProp === "text-stroke") {
    if (typeof value === "number") {
      return ["text-shadow", getTextShadow(value)];
    }
    if (typeof value === "string") {
      const parts = value.split(" ");
      const r = parts[0].replace(/[^0-9.]+/g, "");
      return ["text-shadow", getTextShadow(Number.parseInt(r, 16), parts[1])];
    }
  }
  return [cssProp, String(value)];
};
