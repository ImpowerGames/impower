import { Hertz } from "../types/Hertz";

const A4 = 440; // A4 = 440Hz

export const convertMidiToHertz = (note: number): Hertz => {
  return (A4 / 32) * 2 ** ((note - 9) / 12);
};
