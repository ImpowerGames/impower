export const getCssGrayscale = (value: string): string => {
  if (value) {
    return `grayscale(${value})`;
  }
  return value;
};
