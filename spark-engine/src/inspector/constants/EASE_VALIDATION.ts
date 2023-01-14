import { Ease } from "../../game";
import { RecursiveValidation } from "../types/RecursiveValidation";

export const EASE_VALIDATION: RecursiveValidation<Ease> = {
  x1: [0.01, 0, 1],
  y1: [0.01, -2, 2],
  x2: [0.01, 0, 1],
  y2: [0.01, -2, 2],
};
