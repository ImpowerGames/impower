import { FUNDAMENTAL_KEYS } from "../constants/FUNDAMENTAL_KEYS";
import { Hertz } from "../types/Hertz";
import { Note } from "../types/Note";
import { parseNote } from "./parseNote";

export const convertNoteToHertz = (note: Note | string): Hertz => {
  if (!note) {
    return 0;
  }
  const noteObj = parseNote(note);
  if (!noteObj) {
    return 0;
  }
  const { natural, accidental, octave } = noteObj;
  const keyPosition =
    FUNDAMENTAL_KEYS.indexOf((natural + accidental) as Note) +
    octave * FUNDAMENTAL_KEYS.length;
  return 440 * 2 ** ((keyPosition - 57) / 12);
};
