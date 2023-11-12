import { RecursiveValidation } from "../types/RecursiveValidation";
import { STYLE_PROPS_VALIDATION } from "./STYLE_PROPS_VALIDATION";

export const ANIMATION_VALIDATION = (typeMap?: {
  [type: string]: Record<string, object>;
}): RecursiveValidation => {
  const propsValidation = STYLE_PROPS_VALIDATION(typeMap);
  return {
    ...propsValidation,
    from: propsValidation,
    to: propsValidation,
  };
};
