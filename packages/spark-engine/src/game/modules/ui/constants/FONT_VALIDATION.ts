import { Font } from "../../..";
import { RecursiveValidation } from "../../../core/types/RecursiveValidation";

export const FONT_VALIDATION: RecursiveValidation<Font> = {
  weight: [100, 100, 900],
  style: ["normal", "italic", "oblique"],
};
