export const getCssInvisible = (value: boolean | string): string => {
  if (value === true || value === "") {
    return "hidden";
  }
  if (value === false) {
    return "visible";
  }
  return value;
};
