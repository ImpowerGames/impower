import { Hertz } from "../types/Hertz";

const intervalToFrequencyRatio = (interval: number): number => {
  return Math.pow(2, interval / 12);
};

export const transpose = (hertz: number, semitones: number): Hertz => {
  return hertz * intervalToFrequencyRatio(semitones);
};
