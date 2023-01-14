import { Pattern } from "../../game";
import { RecursiveValidation } from "../types/RecursiveValidation";
import { GRAPHIC_VALIDATION } from "./GRAPHIC_VALIDATION";

export const PATTERN_VALIDATION: RecursiveValidation<Pattern> = {
  weight: [0.1, 1, 10],
  zoom: [0.1, 0.1, 10],
  angle: [1, 0, 360],
  graphic: GRAPHIC_VALIDATION,
};
