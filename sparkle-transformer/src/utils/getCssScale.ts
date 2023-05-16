export const getCssScale = (value: string): string => {
  if (value === "none") {
    return "1";
  }
  return value;
};
