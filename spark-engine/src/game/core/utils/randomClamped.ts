export const randomClamped = (
  min: number,
  max: number,
  rng: (() => number) | undefined
) => {
  if (max === undefined) {
    return min;
  }
  const r = rng || Math.random;
  return r() * (max - min) + min;
};
