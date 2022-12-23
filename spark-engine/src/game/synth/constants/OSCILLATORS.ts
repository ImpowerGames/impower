import { OscillatorType } from "../types/OscillatorType";

const PI2 = 2 * Math.PI;

export interface OscillatorState {
  interpolate?: boolean;
  prevPhase?: number;
  prevRandom?: number;
  b?: [number, number, number, number, number, number, number];
  rng?: () => number;
}

const fix = (x: number, fractionDigits = 10): number => {
  // Fix float precision errors
  const result = Number(x.toFixed(fractionDigits));
  return result === 0 ? 0 : result;
};

const clamp = (x: number, min: number, max: number) => {
  if (x < min) {
    return min;
  }
  if (x > max) {
    return max;
  }
  return x;
};

const lerp = (a: number, b: number, t: number) => {
  return (1 - t) * a + t * b;
};

const frac = (x: number): number => {
  return x - Math.floor(x);
};

const random = (range: number, rng: (() => number) | undefined): number => {
  const r = rng || Math.random;
  return Math.ceil(r() * range) * (Math.round(r()) ? 1 : -1);
};

const sin = (x: number): number => {
  return Math.sin(x);
};

const sgn = (x: number): number => {
  return x > 0 ? 1 : x < 0 ? -1 : 0;
};

const sine = (x: number): number => {
  return sin(PI2 * x);
};

const triangle = (x: number): number => {
  return 1 - 4 * Math.abs(Math.round(x - 1 / 4) - (x - 1 / 4));
};

const sawtooth = (x: number): number => {
  if (x % 0.5 === 0) {
    return 0;
  }
  return 2 * (x - Math.round(x));
};

const square = (x: number): number => {
  return sgn(fix(sin(PI2 * x)));
};

const tangent = (x: number): number => {
  return clamp(0.3 * Math.tan(Math.PI * x), -1, 1);
};

const whistle = (x: number): number => {
  return 0.75 * Math.sin(PI2 * x) + 0.25 * Math.sin(20 * PI2 * x);
};

const whiteState: OscillatorState = {
  interpolate: true,
  prevPhase: 0,
  prevRandom: 0,
  b: [0, 0, 0, 0, 0, 0, 0],
  rng: Math.random,
};

const whitenoise = (x: number, state?: OscillatorState): number => {
  const s = state || whiteState;
  const prevPhase = s.prevPhase || 0;
  const prevRandom = s.prevRandom || 0;
  const currPhase = frac(x * 2);
  const currRandom = currPhase < prevPhase ? random(1, s.rng) : prevRandom;
  const value = s.interpolate
    ? lerp(prevRandom, currRandom, currPhase)
    : currRandom;
  s.prevPhase = currPhase;
  s.prevRandom = currRandom;
  return value;
};

const pinkState: OscillatorState = {
  interpolate: true,
  prevPhase: 0,
  prevRandom: 0,
  b: [0, 0, 0, 0, 0, 0, 0],
  rng: Math.random,
};

const pinknoise = (x: number, state?: OscillatorState): number => {
  const s = state || pinkState;
  const prevPhase = s.prevPhase || 0;
  const prevRandom = s.prevRandom || 0;
  const currPhase = frac(x * 2);
  let currRandom = prevRandom;
  if (currPhase < prevPhase) {
    const white = random(1, s.rng);
    if (!s.b) {
      s.b = [0, 0, 0, 0, 0, 0, 0];
    }
    s.b[0] = 0.99886 * s.b[0] + white * 0.0555179;
    s.b[1] = 0.99332 * s.b[1] + white * 0.0750759;
    s.b[2] = 0.969 * s.b[2] + white * 0.153852;
    s.b[3] = 0.8665 * s.b[3] + white * 0.3104856;
    s.b[4] = 0.55 * s.b[4] + white * 0.5329522;
    s.b[5] = -0.7616 * s.b[5] + white * 0.016898;
    currRandom =
      (s.b[0] +
        s.b[1] +
        s.b[2] +
        s.b[3] +
        s.b[4] +
        s.b[5] +
        s.b[6] +
        white * 0.5362) /
      7;
    s.b[6] = white * 0.115926;
  }
  const value = s.interpolate
    ? lerp(prevRandom, currRandom, currPhase)
    : currRandom;
  s.prevPhase = currPhase;
  s.prevRandom = currRandom;
  return value;
};

const brownState: OscillatorState = {
  interpolate: true,
  prevPhase: 0,
  prevRandom: 0,
  b: [0, 0, 0, 0, 0, 0, 0],
  rng: Math.random,
};

const brownnoise = (x: number, state?: OscillatorState): number => {
  const s = state || brownState;
  const prevPhase = s.prevPhase || 0;
  const prevRandom = s.prevRandom || 0;
  const currPhase = frac(x * 2);
  const currRandom =
    currPhase < prevPhase
      ? clamp(prevRandom + 0.1 * random(1, s.rng), -1, 1)
      : prevRandom;
  const value = s.interpolate
    ? lerp(prevRandom, currRandom, currPhase)
    : currRandom;
  s.prevPhase = currPhase;
  s.prevRandom = currRandom;
  return value;
};

export const OSCILLATORS: Record<
  OscillatorType,
  (t: number, state?: OscillatorState) => number
> = {
  sine,
  triangle,
  sawtooth,
  square,
  tangent,
  whistle,
  whitenoise,
  brownnoise,
  pinknoise,
};
