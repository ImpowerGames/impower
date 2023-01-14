import { SparkStyleProperties, Style, Theme } from "../../game";
import { RecursiveValidation } from "../types/RecursiveValidation";
import { STYLE_PROPS_VALIDATION } from "./STYLE_PROPS_VALIDATION";

export const STYLE_VALIDATION = (objectMap?: {
  [type: string]: Record<string, object>;
}): RecursiveValidation<Style> => {
  const theme: Theme = (objectMap?.["theme"]?.[""] || {}) as Theme;
  const propsValidation = STYLE_PROPS_VALIDATION(objectMap);
  const pseudoValidations: Record<
    string,
    RecursiveValidation<SparkStyleProperties>
  > = {
    hovered: propsValidation,
    pressed: propsValidation,
    focused: propsValidation,
    disabled: propsValidation,
    before: propsValidation,
    after: propsValidation,
  };
  if (theme.breakpoints) {
    Object.keys(theme.breakpoints).forEach((breakpoint) => {
      pseudoValidations[breakpoint] = propsValidation;
    });
  }
  return {
    ...propsValidation,
    ...pseudoValidations,
  };
};
