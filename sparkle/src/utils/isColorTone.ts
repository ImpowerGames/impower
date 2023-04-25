import { ColorTone } from "../types/colorTone";
import { COLOR_REGEX } from "./isColor";

const COLOR_REGEX_SOURCE = COLOR_REGEX.source.replace(/[$^]/g, "");
export const COLOR_TONE_REGEX = new RegExp(`^${COLOR_REGEX_SOURCE}-[0-9]+$`);

export const isColorTone = (obj: unknown): obj is ColorTone => {
  if (typeof obj !== "string") {
    return false;
  }
  return Boolean(obj.match(COLOR_TONE_REGEX));
};
