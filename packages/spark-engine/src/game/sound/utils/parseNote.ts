import { PITCH_NOTATION_REGEX } from "../constants/PITCH_NOTATION_REGEX";
import { Flat, NaturalPitch, Sharp } from "../types/Note";

export const parseNote = (
  note: string
):
  | {
      natural: NaturalPitch;
      accidental: Flat | Sharp;
      octave: number;
    }
  | undefined => {
  const matches = note.match(PITCH_NOTATION_REGEX);
  if (!matches) {
    return undefined;
  }
  const natural = matches?.[1] || "";
  const accidental = matches?.[2] || "";
  const octaveString = matches?.[3] || "";
  const octave =
    octaveString && !Number.isNaN(Number(octaveString))
      ? Number(octaveString)
      : 0;
  return {
    natural: natural as NaturalPitch,
    accidental: accidental as Flat | Sharp,
    octave,
  };
};
