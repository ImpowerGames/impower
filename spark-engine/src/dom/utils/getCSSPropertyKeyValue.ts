import { getCSSPropertyName } from "./getCSSPropertyName";

const shadowKeyUmbraOpacity = 0.2;
const shadowKeyPenumbraOpacity = 0.14;
const shadowAmbientShadowOpacity = 0.12;

const createBoxShadow = (...px: number[]): string => {
  return [
    `${px[0]}px ${px[1]}px ${px[2]}px ${px[3]}px rgba(0,0,0,${shadowKeyUmbraOpacity})`,
    `${px[4]}px ${px[5]}px ${px[6]}px ${px[7]}px rgba(0,0,0,${shadowKeyPenumbraOpacity})`,
    `${px[8]}px ${px[9]}px ${px[10]}px ${px[11]}px rgba(0,0,0,${shadowAmbientShadowOpacity})`,
  ].join(",");
};

const boxShadows = [
  "none",
  createBoxShadow(0, 2, 1, -1, 0, 1, 1, 0, 0, 1, 3, 0),
  createBoxShadow(0, 3, 1, -2, 0, 2, 2, 0, 0, 1, 5, 0),
  createBoxShadow(0, 3, 3, -2, 0, 3, 4, 0, 0, 1, 8, 0),
  createBoxShadow(0, 2, 4, -1, 0, 4, 5, 0, 0, 1, 10, 0),
  createBoxShadow(0, 3, 5, -1, 0, 5, 8, 0, 0, 1, 14, 0),
  createBoxShadow(0, 3, 5, -1, 0, 6, 10, 0, 0, 1, 18, 0),
  createBoxShadow(0, 4, 5, -2, 0, 7, 10, 1, 0, 2, 16, 1),
  createBoxShadow(0, 5, 5, -3, 0, 8, 10, 1, 0, 3, 14, 2),
  createBoxShadow(0, 5, 6, -3, 0, 9, 12, 1, 0, 3, 16, 2),
  createBoxShadow(0, 6, 6, -3, 0, 10, 14, 1, 0, 4, 18, 3),
  createBoxShadow(0, 6, 7, -4, 0, 11, 15, 1, 0, 4, 20, 3),
  createBoxShadow(0, 7, 8, -4, 0, 12, 17, 2, 0, 5, 22, 4),
  createBoxShadow(0, 7, 8, -4, 0, 13, 19, 2, 0, 5, 24, 4),
  createBoxShadow(0, 7, 9, -4, 0, 14, 21, 2, 0, 5, 26, 4),
  createBoxShadow(0, 8, 9, -5, 0, 15, 22, 2, 0, 6, 28, 5),
  createBoxShadow(0, 8, 10, -5, 0, 16, 24, 2, 0, 6, 30, 5),
  createBoxShadow(0, 8, 11, -5, 0, 17, 26, 2, 0, 6, 32, 5),
  createBoxShadow(0, 9, 11, -5, 0, 18, 28, 2, 0, 7, 34, 6),
  createBoxShadow(0, 9, 12, -6, 0, 19, 29, 2, 0, 7, 36, 6),
  createBoxShadow(0, 10, 13, -6, 0, 20, 31, 3, 0, 8, 38, 7),
  createBoxShadow(0, 10, 13, -6, 0, 21, 33, 3, 0, 8, 40, 7),
  createBoxShadow(0, 10, 14, -6, 0, 22, 35, 3, 0, 8, 42, 7),
  createBoxShadow(0, 11, 14, -7, 0, 23, 36, 3, 0, 9, 44, 8),
  createBoxShadow(0, 11, 15, -7, 0, 24, 38, 3, 0, 9, 46, 8),
];

const createTextShadow = (r: number, color = "black"): string => {
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
  if (cssProp === "text-stroke") {
    if (typeof value === "number") {
      return ["text-shadow", createTextShadow(value)];
    }
    if (typeof value === "string") {
      const parts = value.split(" ");
      const r = parts[0].replace(/[^0-9.]+/g, "");
      return [
        "text-shadow",
        createTextShadow(Number.parseInt(r, 16), parts[1]),
      ];
    }
  }
  if (cssProp === "line-height") {
    return [cssProp, String(value)];
  }
  if (
    (cssProp === "box-shadow" || cssProp === "shadow") &&
    typeof value === "number"
  ) {
    return ["box-shadow", boxShadows[value]];
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
  return [cssProp, String(value)];
};
