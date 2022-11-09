import { FUNDAMENTAL_PITCHES } from "../constants/FUNDAMENTAL_PITCHES";
import { Pitch } from "../types/Pitch";
import { parsePitch } from "./parsePitch";

export const getHertz = (pitch: string): number => {
  if (!pitch) {
    return 0;
  }
  const pitchObj = parsePitch(pitch);
  if (!pitchObj) {
    return 0;
  }
  const { note, accidental, octave } = pitchObj;
  const keyPosition =
    FUNDAMENTAL_PITCHES.indexOf((note + accidental) as Pitch) +
    octave * FUNDAMENTAL_PITCHES.length;
  return 440 * 2 ** ((keyPosition - 57) / 12);
};
