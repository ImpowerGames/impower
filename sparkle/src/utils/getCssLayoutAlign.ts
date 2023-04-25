export const getCssLayoutAlign = (value: string): string => {
  if (value === "") {
    return "center";
  }
  if (value === "start") {
    return "flex-start";
  }
  if (value === "end") {
    return "flex-end";
  }
  return value;
};
