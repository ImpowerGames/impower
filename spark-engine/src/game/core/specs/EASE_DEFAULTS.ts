import { Ease } from "../types/Ease";
import { EaseType } from "../types/EaseType";
import { _ease } from "./_ease";

export const EASE_DEFAULTS: Record<"" | EaseType, Ease> = {
  "": _ease(),
  none: { x1: 0, y1: 0, x2: 0, y2: 0 },
  linear: { x1: 0, y1: 0, x2: 1, y2: 1 },
  sineIn: { x1: 0.12, y1: 0, x2: 0.39, y2: 0 },
  sineOut: { x1: 0.61, y1: 1, x2: 0.88, y2: 1 },
  sineInOut: { x1: 0.37, y1: 0, x2: 0.63, y2: 1 },
  quadIn: { x1: 0.11, y1: 0, x2: 0.5, y2: 0 },
  quadOut: { x1: 0.5, y1: 1, x2: 0.89, y2: 1 },
  quadInOut: { x1: 0.45, y1: 0, x2: 0.55, y2: 1 },
  cubicIn: { x1: 0.32, y1: 0, x2: 0.67, y2: 0 },
  cubicOut: { x1: 0.33, y1: 1, x2: 0.68, y2: 1 },
  cubicInOut: { x1: 0.65, y1: 0, x2: 0.35, y2: 1 },
  quartIn: { x1: 0.5, y1: 0, x2: 0.75, y2: 0 },
  quartOut: { x1: 0.25, y1: 1, x2: 0.5, y2: 1 },
  quartInOut: { x1: 0.76, y1: 0, x2: 0.24, y2: 1 },
  quintIn: { x1: 0.64, y1: 0, x2: 0.78, y2: 0 },
  quintOut: { x1: 0.22, y1: 1, x2: 0.36, y2: 1 },
  quintInOut: { x1: 0.83, y1: 0, x2: 0.17, y2: 1 },
  expoIn: { x1: 0.7, y1: 0, x2: 0.84, y2: 0 },
  expoOut: { x1: 0.16, y1: 1, x2: 0.3, y2: 1 },
  expoInOut: { x1: 0.87, y1: 0, x2: 0.13, y2: 1 },
  circIn: { x1: 0.55, y1: 0, x2: 1, y2: 0.45 },
  circOut: { x1: 0, y1: 0.55, x2: 0.45, y2: 1 },
  circInOut: { x1: 0.85, y1: 0, x2: 0.15, y2: 1 },
  backIn: { x1: 0.36, y1: 0, x2: 0.66, y2: -0.56 },
  backOut: { x1: 0.34, y1: 1.56, x2: 0.64, y2: 1 },
  backInOut: { x1: 0.68, y1: -0.6, x2: 0.32, y2: 1.6 },
};
