import { EaseType } from "../types/EaseType";

const pow = Math.pow;
const sqrt = Math.sqrt;
const sin = Math.sin;
const cos = Math.cos;
const PI = Math.PI;
const c1 = 1.70158;
const c2 = c1 * 1.525;
const c3 = c1 + 1;

export const EASE: Record<EaseType, (x: number) => number> = {
  none: (_x: number): number => 1,
  linear: (x: number): number => x,
  quadIn: (x: number): number => {
    return x * x;
  },
  quadOut: (x: number): number => {
    return 1 - (1 - x) * (1 - x);
  },
  quadInOut: (x: number): number => {
    return x < 0.5 ? 2 * x * x : 1 - pow(-2 * x + 2, 2) / 2;
  },
  cubicIn: (x: number): number => {
    return pow(x, 3);
  },
  cubicOut: (x: number): number => {
    return 1 - pow(1 - x, 3);
  },
  cubicInOut: (x: number): number => {
    return x < 0.5 ? 4 * x * x * x : 1 - pow(-2 * x + 2, 3) / 2;
  },
  quartIn: (x: number): number => {
    return pow(x, 4);
  },
  quartOut: (x: number): number => {
    return 1 - pow(1 - x, 4);
  },
  quartInOut: (x: number): number => {
    return x < 0.5 ? 8 * x * x * x * x : 1 - pow(-2 * x + 2, 4) / 2;
  },
  quintIn: (x: number): number => {
    return pow(x, 5);
  },
  quintOut: (x: number): number => {
    return 1 - pow(1 - x, 5);
  },
  quintInOut: (x: number): number => {
    return x < 0.5 ? 16 * x * x * x * x * x : 1 - pow(-2 * x + 2, 5) / 2;
  },
  sineIn: (x: number): number => {
    return 1 - cos((x * PI) / 2);
  },
  sineOut: (x: number): number => {
    return sin((x * PI) / 2);
  },
  sineInOut: (x: number): number => {
    return -(cos(PI * x) - 1) / 2;
  },
  expoIn: (x: number): number => {
    return x === 0 ? 0 : pow(2, 10 * x - 10);
  },
  expoOut: (x: number): number => {
    return x === 1 ? 1 : 1 - pow(2, -10 * x);
  },
  expoInOut: (x: number): number => {
    return x === 0
      ? 0
      : x === 1
      ? 1
      : x < 0.5
      ? pow(2, 20 * x - 10) / 2
      : (2 - pow(2, -20 * x + 10)) / 2;
  },
  circIn: (x: number): number => {
    return 1 - sqrt(1 - pow(x, 2));
  },
  circOut: (x: number): number => {
    return sqrt(1 - pow(x - 1, 2));
  },
  circInOut: (x: number): number => {
    return x < 0.5
      ? (1 - sqrt(1 - pow(2 * x, 2))) / 2
      : (sqrt(1 - pow(-2 * x + 2, 2)) + 1) / 2;
  },
  backIn: (x: number): number => {
    return c3 * x * x * x - c1 * x * x;
  },
  backOut: (x: number): number => {
    return 1 + c3 * pow(x - 1, 3) + c1 * pow(x - 1, 2);
  },
  backInOut: (x: number): number => {
    return x < 0.5
      ? (pow(2 * x, 2) * ((c2 + 1) * 2 * x - c2)) / 2
      : (pow(2 * x - 2, 2) * ((c2 + 1) * (x * 2 - 2) + c2) + 2) / 2;
  },
} as const;
