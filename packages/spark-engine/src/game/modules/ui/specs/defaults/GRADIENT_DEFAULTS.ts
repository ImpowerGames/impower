import { Gradient } from "../Gradient";
import { _gradient } from "./_gradient";

export const GRADIENT_DEFAULTS: Record<string, Gradient> = {
  default: _gradient(),
};
