export const interpolate = (
  t: number,
  a: number,
  b: number,
  ease?: (t: number) => number
): number => {
  if (!ease) {
    return a;
  }
  return a * (1 - ease(t)) + b * ease(t);
};
