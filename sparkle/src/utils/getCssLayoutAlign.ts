export const getCssLayoutAlign = (value: boolean | string): string => {
  if (value === true || value === "") {
    return "center";
  }
  if (value === false || value === "start") {
    return "flex-start";
  }
  if (value === "end") {
    return "flex-end";
  }
  return value;
};
