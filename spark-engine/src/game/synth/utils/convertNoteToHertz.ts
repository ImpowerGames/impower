import { FUNDAMENTAL_KEYS } from "../constants/FUNDAMENTAL_KEYS";
import { Hertz } from "../types/Hertz";
import { Note } from "../types/Note";
import { parseNote } from "./parseNote";

const A4 = 440.0; // An A-note in the fourth octave

const calculateStepsFromNote = (
  natural: string,
  accidental: string,
  octave: number
): number => {
  const key = (natural + accidental) as Note;
  const index = FUNDAMENTAL_KEYS.indexOf(key);
  const step = index - 9;
  return step - (4 - octave) * 12;
};

const calculateFrequencyByStep = (steps: number): number => {
  return A4 * Math.pow(Math.pow(2, 1 / 12), steps);
};

export const convertNoteToHertz = (
  note: Note | string | number | undefined
): Hertz => {
  if (typeof note === "number") {
    return note;
  }
  if (!note) {
    return 0;
  }
  const noteObj = parseNote(note);
  if (!noteObj) {
    return 0;
  }
  const { natural, accidental, octave } = noteObj;
  return calculateFrequencyByStep(
    calculateStepsFromNote(natural, accidental, octave)
  );
};
