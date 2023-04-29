export const getCssSepia = (value: string): string => {
  if (value) {
    return `sepia(${value})`;
  }
  return value;
};
