export const getCssInvert = (value: string): string => {
  if (value) {
    return `invert(${value})`;
  }
  return value;
};
