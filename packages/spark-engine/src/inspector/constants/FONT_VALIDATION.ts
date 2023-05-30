import { Font } from "../../game";
import { RecursiveValidation } from "../types/RecursiveValidation";

export const FONT_VALIDATION: RecursiveValidation<Font> = {
  weight: [100, 100, 900],
  style: ["normal", "italic", "oblique"],
};
