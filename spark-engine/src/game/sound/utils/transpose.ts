import { Hertz } from "../types/Hertz";
import { Note } from "../types/Note";
import { convertPitchNoteToHertz } from "./convertPitchNoteToHertz";
import { convertSemitonesToFrequencyFactor } from "./convertSemitonesToFrequencyFactor";

export const transpose = (
  note: number | Note | undefined,
  semitones: number
): Hertz => {
  return (
    convertPitchNoteToHertz(note) * convertSemitonesToFrequencyFactor(semitones)
  );
};
