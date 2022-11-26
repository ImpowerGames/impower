import { Hertz } from "../types/Hertz";
import { Note } from "../types/Note";
import { convertNoteToHertz } from "./convertNoteToHertz";

const intervalToFrequencyRatio = (interval: number): number => {
  return Math.pow(2, interval / 12);
};

export const transpose = (
  note: number | Note | undefined,
  semitones: number
): Hertz => {
  return convertNoteToHertz(note) * intervalToFrequencyRatio(semitones);
};
