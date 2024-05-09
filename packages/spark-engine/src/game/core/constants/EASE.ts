import { EaseType } from "../../modules/ui/types/EaseType";

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
  quad_in: (x: number): number => {
    return x * x;
  },
  quad_out: (x: number): number => {
    return 1 - (1 - x) * (1 - x);
  },
  quad_in_out: (x: number): number => {
    return x < 0.5 ? 2 * x * x : 1 - pow(-2 * x + 2, 2) / 2;
  },
  cubic_in: (x: number): number => {
    return pow(x, 3);
  },
  cubic_out: (x: number): number => {
    return 1 - pow(1 - x, 3);
  },
  cubic_in_out: (x: number): number => {
    return x < 0.5 ? 4 * x * x * x : 1 - pow(-2 * x + 2, 3) / 2;
  },
  quart_in: (x: number): number => {
    return pow(x, 4);
  },
  quart_out: (x: number): number => {
    return 1 - pow(1 - x, 4);
  },
  quart_in_out: (x: number): number => {
    return x < 0.5 ? 8 * x * x * x * x : 1 - pow(-2 * x + 2, 4) / 2;
  },
  quint_in: (x: number): number => {
    return pow(x, 5);
  },
  quint_out: (x: number): number => {
    return 1 - pow(1 - x, 5);
  },
  quint_in_out: (x: number): number => {
    return x < 0.5 ? 16 * x * x * x * x * x : 1 - pow(-2 * x + 2, 5) / 2;
  },
  sine_in: (x: number): number => {
    return 1 - cos((x * PI) / 2);
  },
  sine_out: (x: number): number => {
    return sin((x * PI) / 2);
  },
  sine_in_out: (x: number): number => {
    return -(cos(PI * x) - 1) / 2;
  },
  expo_in: (x: number): number => {
    return x === 0 ? 0 : pow(2, 10 * x - 10);
  },
  expo_out: (x: number): number => {
    return x === 1 ? 1 : 1 - pow(2, -10 * x);
  },
  expo_in_out: (x: number): number => {
    return x === 0
      ? 0
      : x === 1
      ? 1
      : x < 0.5
      ? pow(2, 20 * x - 10) / 2
      : (2 - pow(2, -20 * x + 10)) / 2;
  },
  circ_in: (x: number): number => {
    return 1 - sqrt(1 - pow(x, 2));
  },
  circ_out: (x: number): number => {
    return sqrt(1 - pow(x - 1, 2));
  },
  circ_in_out: (x: number): number => {
    return x < 0.5
      ? (1 - sqrt(1 - pow(2 * x, 2))) / 2
      : (sqrt(1 - pow(-2 * x + 2, 2)) + 1) / 2;
  },
  back_in: (x: number): number => {
    return c3 * x * x * x - c1 * x * x;
  },
  back_out: (x: number): number => {
    return 1 + c3 * pow(x - 1, 3) + c1 * pow(x - 1, 2);
  },
  back_in_out: (x: number): number => {
    return x < 0.5
      ? (pow(2 * x, 2) * ((c2 + 1) * 2 * x - c2)) / 2
      : (pow(2 * x - 2, 2) * ((c2 + 1) * (x * 2 - 2) + c2) + 2) / 2;
  },
} as const;
