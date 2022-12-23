export const clampedRandom = (
  min: number,
  max: number,
  rng?: () => number
): number => {
  if (max === undefined) {
    return min;
  }
  const r = rng || Math.random;
  return r() * (max - min) + min;
};
