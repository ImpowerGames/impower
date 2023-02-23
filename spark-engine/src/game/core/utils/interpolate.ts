export const interpolate = (
  t: number,
  a: number,
  b: number,
  ease?: (t: number) => number
): number => {
  if (t <= 0) {
    return a;
  }
  const p = t - Math.floor(t);
  if (!ease) {
    return b;
  }
  return a * (1 - ease(p)) + b * ease(p);
};
