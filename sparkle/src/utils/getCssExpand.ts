export const getCssExpand = (value: boolean | string): string => {
  if (value === true) {
    return "1";
  }
  if (value === false || value === "none") {
    return "0";
  }
  return value;
};
