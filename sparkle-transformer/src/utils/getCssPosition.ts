export const getCssPosition = (value: string): string => {
  if (value === "default") {
    return "static";
  }
  return value;
};
