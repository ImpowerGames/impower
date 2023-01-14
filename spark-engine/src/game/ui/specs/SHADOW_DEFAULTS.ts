import { Shadow } from "../types/Shadow";
import { _shadow } from "./_shadow";

export const SHADOW_DEFAULTS: Record<string, Shadow> = {
  "": _shadow(),
  xs: {
    layers: [
      {
        offsetX: 0,
        offsetY: 1,
        blur: 2,
        spread: 0,
        color: "black",
        opacity: 0.3,
      },
      {
        offsetX: 0,
        offsetY: 1,
        blur: 3,
        spread: 1,
        color: "black",
        opacity: 0.15,
      },
    ],
  },
  sm: {
    layers: [
      {
        offsetX: 0,
        offsetY: 1,
        blur: 2,
        spread: 0,
        color: "black",
        opacity: 0.3,
      },
      {
        offsetX: 0,
        offsetY: 2,
        blur: 6,
        spread: 2,
        color: "black",
        opacity: 0.15,
      },
    ],
  },
  md: {
    layers: [
      {
        offsetX: 0,
        offsetY: 1,
        blur: 3,
        spread: 0,
        color: "black",
        opacity: 0.3,
      },
      {
        offsetX: 0,
        offsetY: 4,
        blur: 8,
        spread: 3,
        color: "black",
        opacity: 0.15,
      },
    ],
  },
  lg: {
    layers: [
      {
        offsetX: 0,
        offsetY: 2,
        blur: 3,
        spread: 0,
        color: "black",
        opacity: 0.3,
      },
      {
        offsetX: 0,
        offsetY: 6,
        blur: 10,
        spread: 4,
        color: "black",
        opacity: 0.15,
      },
    ],
  },
  xl: {
    layers: [
      {
        offsetX: 0,
        offsetY: 4,
        blur: 4,
        spread: 0,
        color: "black",
        opacity: 0.3,
      },
      {
        offsetX: 0,
        offsetY: 8,
        blur: 12,
        spread: 6,
        color: "black",
        opacity: 0.15,
      },
    ],
  },
};
