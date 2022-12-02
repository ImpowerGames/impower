export const interpolate = (
  t: number,
  a: number,
  b: number,
  ease?: (t: number) => number
): number => {
  if (t <= 0) {
    return a;
  }
  if (!ease) {
    return b;
  }
  return a * (1 - ease(t)) + b * ease(t);
};
