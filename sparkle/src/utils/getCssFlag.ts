export const getCssFlag = (value: string, defaultValue: string): string => {
  if (value === "") {
    return defaultValue;
  }
  return value;
};
