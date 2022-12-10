import { Hertz } from "../types/Hertz";
import { Note } from "../types/Note";
import { convertNoteToHertz } from "./convertNoteToHertz";
import { convertSemitonesToFrequencyFactor } from "./convertSemitonesToFrequencyFactor";

export const transpose = (
  note: number | Note | undefined,
  semitones: number
): Hertz => {
  return (
    convertNoteToHertz(note) * convertSemitonesToFrequencyFactor(semitones)
  );
};
