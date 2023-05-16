export const getCssTextStrikethrough = (value: string): string => {
  if (value === "") {
    return "line-through";
  }
  if (!value) {
    return "";
  }
  return value;
};
