import { FUNDAMENTAL_KEYS } from "../constants/FUNDAMENTAL_KEYS";
import { Note } from "../types/Note";

export const getNote = (hertz: number): Note => {
  const freqNum = 12 * (Math.log(hertz / 440) / Math.log(2));
  const freq = Math.round(freqNum) + 69;
  const keyIndex = freq % FUNDAMENTAL_KEYS.length;
  const key = FUNDAMENTAL_KEYS[keyIndex];
  const octave = Math.trunc(freq / FUNDAMENTAL_KEYS.length);
  return `${key}${octave}` as Note;
};
