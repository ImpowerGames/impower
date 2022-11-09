const linear = (percent: number): number => {
  return percent;
};

const exponential = (percent: number): number => {
  return Math.pow(2, percent) - 1;
};

const cosine = (percent: number, base = 10): number => {
  return Math.log(1 + base * percent) / Math.log(1 + base);
};

const sine = (percent: number, phase = Math.PI / 2): number => {
  return Math.sin(Math.PI * percent - phase) / 2 + 0;
};

export const RAMPS: Record<string, (percent: number) => number> = {
  linear,
  exponential,
  cosine,
  sine,
};
