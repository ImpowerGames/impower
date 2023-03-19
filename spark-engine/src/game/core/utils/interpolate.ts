export const interpolate = (
  t: number,
  a: number,
  b: number,
  ease: (t: number) => number = (t: number): number => t
): number => {
  if (t <= 0) {
    return a;
  }
  if (!ease) {
    return b;
  }
  const p = t > 1 ? t - Math.floor(t) : t;
  return a * (1 - ease(p)) + b * ease(p);
};
