import { _shadow } from "../_shadow";

export const SHADOW_DEFAULTS = {
  default: _shadow({ $name: "default" }),
  xs: _shadow({
    $name: "xs",
    layers: [
      {
        x: 0,
        y: 1,
        blur: 2,
        spread: 0,
        color: "black",
        opacity: 0.3,
      },
      {
        x: 0,
        y: 1,
        blur: 3,
        spread: 1,
        color: "black",
        opacity: 0.15,
      },
    ],
  }),
  sm: _shadow({
    $name: "sm",
    layers: [
      {
        x: 0,
        y: 1,
        blur: 2,
        spread: 0,
        color: "black",
        opacity: 0.3,
      },
      {
        x: 0,
        y: 2,
        blur: 6,
        spread: 2,
        color: "black",
        opacity: 0.15,
      },
    ],
  }),
  md: _shadow({
    $name: "md",
    layers: [
      {
        x: 0,
        y: 1,
        blur: 3,
        spread: 0,
        color: "black",
        opacity: 0.3,
      },
      {
        x: 0,
        y: 4,
        blur: 8,
        spread: 3,
        color: "black",
        opacity: 0.15,
      },
    ],
  }),
  lg: _shadow({
    $name: "lg",
    layers: [
      {
        x: 0,
        y: 2,
        blur: 3,
        spread: 0,
        color: "black",
        opacity: 0.3,
      },
      {
        x: 0,
        y: 6,
        blur: 10,
        spread: 4,
        color: "black",
        opacity: 0.15,
      },
    ],
  }),
  xl: _shadow({
    $name: "xl",
    layers: [
      {
        x: 0,
        y: 4,
        blur: 4,
        spread: 0,
        color: "black",
        opacity: 0.3,
      },
      {
        x: 0,
        y: 8,
        blur: 12,
        spread: 6,
        color: "black",
        opacity: 0.15,
      },
    ],
  }),
};
