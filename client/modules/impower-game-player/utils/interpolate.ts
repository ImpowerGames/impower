export const bezier = (
  t: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number => {
  return (
    (1 - t) * (1 - t) * (1 - t) * x1 +
    3 * (1 - t) * (1 - t) * t * y1 +
    3 * (1 - t) * t * t * x2 +
    t * t * t * y2
  );
};

export const linear = (t: number, a: number, b: number): number => {
  return (1 - t) * a + t * b;
};
