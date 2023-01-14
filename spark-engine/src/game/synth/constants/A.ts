import { Hertz } from "../types/Hertz";

const A1 = 55;

const freq = (octave: number): Hertz => {
  return A1 * Math.pow(2, octave - 1);
};

export const A = [
  freq(0),
  freq(1),
  freq(2),
  freq(3),
  freq(4),
  freq(5),
  freq(6),
  freq(7),
  freq(8),
  freq(9),
  freq(10),
  freq(11),
  freq(12),
  freq(13),
  freq(14),
  freq(15),
  freq(16),
] as const;
