const PI2 = 2 * Math.PI;

const fix = (x: number, fractionDigits = 10): number => {
  // Fix float precision errors
  const result = Number(x.toFixed(fractionDigits));
  return result === 0 ? 0 : result;
};

const sin = (x: number): number => {
  return Math.sin(x);
};

const cos = (x: number): number => {
  return Math.cos(x);
};

const sgn = (x: number): number => {
  return x > 0 ? 1 : x < 0 ? -1 : 0;
};

const sine = (x: number): number => {
  return sin(PI2 * x);
};

const cosine = (x: number): number => {
  return cos(PI2 * x);
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

const noise = (_t: number): number => {
  return Math.random() * 2 - 1;
};

export const OSCILLATORS: Record<string, (t: number) => number> = {
  sine,
  cosine,
  triangle,
  sawtooth,
  square,
  noise,
};
