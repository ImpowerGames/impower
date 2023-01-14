import { Theme } from "../../game/ui/types/Theme";
import { RecursiveValidation } from "../types/RecursiveValidation";

export const THEME_VALIDATION: RecursiveValidation<Theme> = {
  breakpoints: {
    xs: [1, 0, 2000],
    sm: [1, 0, 2000],
    md: [1, 0, 2000],
    lg: [1, 0, 2000],
    xl: [1, 0, 2000],
  },
};
