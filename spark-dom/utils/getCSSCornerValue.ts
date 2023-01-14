import { getCSSCornerKey } from "./getCSSCornerKey";

const functions = {
  "border-radius": (
    topLeft: string,
    topRight: string,
    bottomRight: string,
    bottomLeft: string
  ) => {
    return `${topLeft} ${topRight} ${bottomRight} ${bottomLeft}`;
  },
  "clip-path": (
    topLeft: string,
    topRight: string,
    bottomRight: string,
    bottomLeft: string
  ) => {
    return `polygon(0% ${topLeft}, ${topLeft} 0%, calc(100% - ${topRight}) 0%, 100% ${topRight}, 100% calc(100% - ${bottomRight}), calc(100% - ${bottomRight}) 100%, ${bottomLeft} 100%, 0% calc(100% - ${bottomLeft}))`;
  },
};

export const getCSSCornerValue = (
  shape: "round" | "cut",
  side: "all" | "top" | "bottom" | "left" | "right",
  value: string | number
) => {
  if (value === "none") {
    return shape === "cut" ? "none" : "0";
  }
  const key = getCSSCornerKey(shape);
  const format = functions[key];
  if (value === "full") {
    return format("50%", "50%", "50%", "50%");
  }
  const px = typeof value === "string" ? value : `${value}px`;
  if (side === "top") {
    return format(px, px, "0", "0");
  }
  if (side === "bottom") {
    return format("0", "0", px, px);
  }
  if (side === "left") {
    return format(px, "0", "0", px);
  }
  if (side === "right") {
    return format("0", px, px, "0");
  }
  return format(px, px, px, px);
};
