export const getCssSaturate = (value: string): string => {
  if (value) {
    return `saturate(${value})`;
  }
  return value;
};
