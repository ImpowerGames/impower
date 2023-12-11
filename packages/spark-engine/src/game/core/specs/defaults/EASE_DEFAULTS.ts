import { EaseType } from "../../types/EaseType";
import { Ease } from "../Ease";
import { _ease } from "./_ease";

export const EASE_DEFAULTS: Record<"" | EaseType, Ease> = {
  default: _ease(),
  none: { x1: 0, y1: 0, x2: 0, y2: 0 },
  linear: { x1: 0, y1: 0, x2: 1, y2: 1 },
  sine_in: { x1: 0.12, y1: 0, x2: 0.39, y2: 0 },
  sine_out: { x1: 0.61, y1: 1, x2: 0.88, y2: 1 },
  sine_in_out: { x1: 0.37, y1: 0, x2: 0.63, y2: 1 },
  quad_in: { x1: 0.11, y1: 0, x2: 0.5, y2: 0 },
  quad_out: { x1: 0.5, y1: 1, x2: 0.89, y2: 1 },
  quad_in_out: { x1: 0.45, y1: 0, x2: 0.55, y2: 1 },
  cubic_in: { x1: 0.32, y1: 0, x2: 0.67, y2: 0 },
  cubic_out: { x1: 0.33, y1: 1, x2: 0.68, y2: 1 },
  cubic_in_out: { x1: 0.65, y1: 0, x2: 0.35, y2: 1 },
  quart_in: { x1: 0.5, y1: 0, x2: 0.75, y2: 0 },
  quart_out: { x1: 0.25, y1: 1, x2: 0.5, y2: 1 },
  quart_in_out: { x1: 0.76, y1: 0, x2: 0.24, y2: 1 },
  quint_in: { x1: 0.64, y1: 0, x2: 0.78, y2: 0 },
  quint_out: { x1: 0.22, y1: 1, x2: 0.36, y2: 1 },
  quint_in_out: { x1: 0.83, y1: 0, x2: 0.17, y2: 1 },
  expo_in: { x1: 0.7, y1: 0, x2: 0.84, y2: 0 },
  expo_out: { x1: 0.16, y1: 1, x2: 0.3, y2: 1 },
  expo_in_out: { x1: 0.87, y1: 0, x2: 0.13, y2: 1 },
  circ_in: { x1: 0.55, y1: 0, x2: 1, y2: 0.45 },
  circ_out: { x1: 0, y1: 0.55, x2: 0.45, y2: 1 },
  circ_in_out: { x1: 0.85, y1: 0, x2: 0.15, y2: 1 },
  back_in: { x1: 0.36, y1: 0, x2: 0.66, y2: -0.56 },
  back_out: { x1: 0.34, y1: 1.56, x2: 0.64, y2: 1 },
  back_in_out: { x1: 0.68, y1: -0.6, x2: 0.32, y2: 1.6 },
};
