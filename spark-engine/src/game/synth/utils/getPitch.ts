import { FUNDAMENTAL_PITCHES } from "../constants/FUNDAMENTAL_PITCHES";
import { Pitch } from "../types/Pitch";

export const getPitch = (hertz: number): Pitch => {
  const freqNum = 12 * (Math.log(hertz / 440) / Math.log(2));
  const freq = Math.round(freqNum) + 69;
  const pitchIndex = freq % FUNDAMENTAL_PITCHES.length;
  const pitch = FUNDAMENTAL_PITCHES[pitchIndex];
  const octave = Math.trunc(freq / FUNDAMENTAL_PITCHES.length);
  return `${pitch}${octave}` as Pitch;
};
