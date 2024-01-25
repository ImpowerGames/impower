import { Tone } from "../types/Tone";
import { parseTone } from "./parseTone";

export const parseTones = (str: string, separator: string): Tone[] => {
  const tones: Tone[] = [];
  str.split(separator).forEach((t) => {
    tones.push(parseTone(t));
  });
  return tones;
};
