export const getCssUnit = (value: string, defaultUnit: string): string => {
  const isValidNumber = !Number.isNaN(Number(value));
  if (isValidNumber) {
    return `${value}${defaultUnit}`;
  }
  return value;
};
