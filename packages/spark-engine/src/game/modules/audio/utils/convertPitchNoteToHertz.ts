import { FUNDAMENTAL_KEYS } from "../constants/FUNDAMENTAL_KEYS";
import { Hertz } from "../types/Hertz";
import { Accidental, NaturalPitch, Note } from "../types/Note";
import { convertSemitonesToFrequencyFactor } from "./convertSemitonesToFrequencyFactor";
import { parseNote } from "./parseNote";

const A4 = 440.0; // An A-note in the fourth octave

const calculateStepsFromNote = (
  natural: NaturalPitch,
  accidental: Accidental,
  octave: number
): number => {
  const naturalIndex = FUNDAMENTAL_KEYS.indexOf(natural);
  const index =
    accidental === "#"
      ? naturalIndex + 1
      : accidental === "b"
      ? naturalIndex - 1
      : naturalIndex;
  const step = index - 9;
  return step - (4 - octave) * 12;
};

const calculateFrequencyByStep = (steps: number): number => {
  return A4 * Math.pow(convertSemitonesToFrequencyFactor(1), steps);
};

export const convertPitchNoteToHertz = (
  note: Note | string | number | undefined
): Hertz | undefined => {
  if (note == null) {
    return note;
  }
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
