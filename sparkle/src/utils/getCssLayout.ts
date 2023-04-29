export const getCssLayout = (value: string): string => {
  if (value === "") {
    return "row";
  }
  return value;
};
