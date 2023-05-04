const noNegativeZero = (n: number) => (Object.is(n, -0) ? 0 : n);

export const clamp = (value: number, min: number, max: number) => {
  if (value < min) {
    return noNegativeZero(min);
  }
  if (value > max) {
    return noNegativeZero(max);
  }
  return noNegativeZero(value);
};
