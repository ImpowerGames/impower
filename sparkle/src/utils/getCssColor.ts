import { Tone } from "../types/tone";
import { isColor } from "./isColor";
import { isColorTone } from "./isColorTone";

export const getCssColor = (
  color: string,
  fallbackTone: Tone = "70"
): string => {
  if (isColorTone(color)) {
    return `var(--s-color-${color})`;
  }
  if (isColor(color)) {
    return `var(--s-color-${color}-${fallbackTone})`;
  }
  return color;
};
