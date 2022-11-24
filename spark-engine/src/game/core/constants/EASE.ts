import { EaseType } from "../types/EaseType";

const pow = Math.pow;
const sqrt = Math.sqrt;
const sin = Math.sin;
const cos = Math.cos;
const PI = Math.PI;
const c1 = 1.70158;
const c2 = c1 * 1.525;
const c3 = c1 + 1;
const c4 = (2 * PI) / 3;
const c5 = (2 * PI) / 4.5;

const bounceOut = (x: number): number => {
  const n1 = 7.5625;
  const d1 = 2.75;

  if (x < 1 / d1) {
    return n1 * x * x;
  } else if (x < 2 / d1) {
    return n1 * (x -= 1.5 / d1) * x + 0.75;
  } else if (x < 2.5 / d1) {
    return n1 * (x -= 2.25 / d1) * x + 0.9375;
  } else {
    return n1 * (x -= 2.625 / d1) * x + 0.984375;
  }
};

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
    return x * x * x;
  },
  cubicOut: (x: number): number => {
    return 1 - pow(1 - x, 3);
  },
  cubicInOut: (x: number): number => {
    return x < 0.5 ? 4 * x * x * x : 1 - pow(-2 * x + 2, 3) / 2;
  },
  quartIn: (x: number): number => {
    return x * x * x * x;
  },
  quartOut: (x: number): number => {
    return 1 - pow(1 - x, 4);
  },
  quartInOut: (x: number): number => {
    return x < 0.5 ? 8 * x * x * x * x : 1 - pow(-2 * x + 2, 4) / 2;
  },
  quintIn: (x: number): number => {
    return x * x * x * x * x;
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
  elasticIn: (x: number): number => {
    return x === 0
      ? 0
      : x === 1
      ? 1
      : -pow(2, 10 * x - 10) * sin((x * 10 - 10.75) * c4);
  },
  elasticOut: (x: number): number => {
    return x === 0
      ? 0
      : x === 1
      ? 1
      : pow(2, -10 * x) * sin((x * 10 - 0.75) * c4) + 1;
  },
  elasticInOut: (x: number): number => {
    return x === 0
      ? 0
      : x === 1
      ? 1
      : x < 0.5
      ? -(pow(2, 20 * x - 10) * sin((20 * x - 11.125) * c5)) / 2
      : (pow(2, -20 * x + 10) * sin((20 * x - 11.125) * c5)) / 2 + 1;
  },
  bounceIn: (x: number): number => {
    return 1 - bounceOut(1 - x);
  },
  bounceOut: bounceOut,
  bounceInOut: (x: number): number => {
    return x < 0.5
      ? (1 - bounceOut(1 - 2 * x)) / 2
      : (1 + bounceOut(2 * x - 1)) / 2;
  },
} as const;
