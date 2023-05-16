import { STYLE_TRANSFORMERS } from "../constants/STYLE_TRANSFORMERS";
import { Graphic } from "../types/graphic";
import { getCssIcon } from "./getCssIcon";
import { getCssPattern } from "./getCssPattern";

export const configureStyleTransformers = (config: {
  graphics?: Record<string, Graphic>;
}): typeof STYLE_TRANSFORMERS => ({
  ...STYLE_TRANSFORMERS,
  "background-pattern": (v: string) => getCssPattern(v, config?.graphics),
  icon: (v: string) => getCssIcon(v, "", config?.graphics),
});
