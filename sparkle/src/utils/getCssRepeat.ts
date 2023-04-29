export const getCssRepeat = (value: boolean | string): string => {
  if (value === true) {
    return "repeat";
  }
  if (value === false || value === "none" || value === "norepeat") {
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
