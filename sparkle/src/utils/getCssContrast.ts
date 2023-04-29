export const getCssContrast = (value: string): string => {
  if (value) {
    return `contrast(${value})`;
  }
  return value;
};
