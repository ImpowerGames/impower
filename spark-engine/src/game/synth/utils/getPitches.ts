import { FUNDAMENTAL_PITCHES } from "../constants/FUNDAMENTAL_PITCHES";
import { Pitch } from "../types/Pitch";

export const getPitches = (minOctave = 0, maxOctave = 8): Pitch[] => {
  const pitches: Pitch[] = [];
  for (let i = minOctave; i < maxOctave; i += 1) {
    const suffix = i <= 0 ? "" : i;
    FUNDAMENTAL_PITCHES.forEach((p) => {
      const pitch = `${p}${suffix}` as Pitch;
      pitches.push(pitch);
    });
  }
  return pitches;
};
