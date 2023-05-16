export const getCssChildJustify = (value: string): string => {
  if (value === "start") {
    return "flex-start";
  }
  if (value === "end") {
    return "flex-end";
  }
  if (value === "between") {
    return "space-between";
  }
  if (value === "around") {
    return "space-around";
  }
  if (value === "evenly") {
    return "space-evenly";
  }
  return value;
};
