import { PITCH_NOTATION_REGEX } from "../constants/PITCH_NOTATION_REGEX";
import { Accidental, Note } from "../types/Pitch";

export const parsePitch = (
  pitch: string
): {
  note: Note | "";
  accidental: Accidental | "";
  octave: number;
} => {
  const matches = pitch.match(PITCH_NOTATION_REGEX);
  const note = matches?.[1] || "";
  const accidental = matches?.[2] || "";
  const octaveString = matches?.[3] || "";
  const octave =
    octaveString && !Number.isNaN(octaveString) ? Number(octaveString) : 0;
  return {
    note: note as Note,
    accidental: accidental as Accidental,
    octave,
  };
};
