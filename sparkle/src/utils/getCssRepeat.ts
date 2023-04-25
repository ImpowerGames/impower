export const getCssRepeat = (value: string): string => {
  if (value === "none" || value === "norepeat") {
    return "no-repeat";
  }
  if (value === "x") {
    return "repeat-x";
  }
  if (value === "y") {
    return "repeat-y";
  }
  return value;
};
