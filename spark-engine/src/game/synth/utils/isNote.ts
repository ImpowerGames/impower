import { PITCH_NOTATION_REGEX } from "../constants/PITCH_NOTATION_REGEX";
import { Note } from "../types/Note";

export const isNote = (obj: unknown): obj is Note => {
  if (typeof obj !== "string") {
    return false;
  }
  return Boolean(obj.match(PITCH_NOTATION_REGEX));
};
