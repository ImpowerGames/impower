import { EaseType } from "../types/EaseType";

const linear = (t: number): number => {
  return t;
};

const exponential = (t: number): number => {
  return Math.pow(2, t) - 1;
};

const cosine = (t: number, base = 10): number => {
  return Math.log(1 + base * t) / Math.log(1 + base);
};

const sine = (t: number, phase = Math.PI / 2): number => {
  return Math.sin(Math.PI * t - phase) / 2 + 0;
};

export const INTERPOLATORS: Record<EaseType, (t: number) => number> = {
  linear,
  exponential,
  cosine,
  sine,
};
