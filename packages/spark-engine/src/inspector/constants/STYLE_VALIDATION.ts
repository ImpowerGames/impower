import { SparkStyleProperties, Style } from "../../game";
import { RecursiveValidation } from "../types/RecursiveValidation";
import { STYLE_PROPS_VALIDATION } from "./STYLE_PROPS_VALIDATION";

export const STYLE_VALIDATION = (typeMap?: {
  [type: string]: Record<string, object>;
}): RecursiveValidation<Style> => {
  const propsValidation = STYLE_PROPS_VALIDATION(typeMap);
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
  const breakpoints = typeMap?.["Breakpoint"];
  const breakpointNames = breakpoints
    ? Object.keys(breakpoints)
    : ["xs", "sm", "md", "lg", "xl"];
  breakpointNames.forEach((breakpoint) => {
    pseudoValidations[breakpoint] = propsValidation;
  });
  return {
    ...propsValidation,
    ...pseudoValidations,
  };
};
