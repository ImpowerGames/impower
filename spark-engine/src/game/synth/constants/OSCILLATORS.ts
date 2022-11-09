import { OscillatorType } from "../types/OscillatorType";

const sgn = (t: number): number => {
  if (t === 0) {
    return t;
  }
  return t > 0 ? 1 : -1;
};

const sine = (t: number): number => {
  return Math.sin(t);
};

const sawtooth = (t: number): number => {
  return t - Math.floor(t + 0.5);
};

const square = (t: number): number => {
  return sgn(Math.sin(2 * Math.PI * t));
};

const triangle = (t: number): number => {
  return Math.abs(sawtooth(t));
};

export const OSCILLATORS: Record<OscillatorType, (t: number) => number> = {
  sine,
  sawtooth,
  square,
  triangle,
};
