import { Tone } from "../types/Tone";
import { stringifyTone } from "./stringifyTone";

export const stringifyTones = (tones: Tone[]): string => {
  return tones.map((t) => stringifyTone(t)).join("-");
};
