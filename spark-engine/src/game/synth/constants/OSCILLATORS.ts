import { OscillatorType } from "../types/OscillatorType";

const sgn = (t: number): number => {
  return t === 0 ? t : t > 0 ? 1 : -1;
};

const sine = (t: number): number => {
  return Math.sin(2 * Math.PI * t);
};

const cosine = (t: number): number => {
  return Math.cos(2 * Math.PI * t);
};

const triangle = (t: number): number => {
  return 1 - 4 * Math.abs(Math.round(t) - t);
};

const sawtooth = (t: number): number => {
  return 2 * (t - Math.round(t));
};

const square = (t: number): number => {
  return sgn(Math.sin(2 * Math.PI * t));
};

const noise = (_t: number): number => {
  return Math.random() * 2 - 1;
};

export const OSCILLATORS: Record<OscillatorType, (t: number) => number> = {
  sine,
  cosine,
  triangle,
  sawtooth,
  square,
  noise,
};
