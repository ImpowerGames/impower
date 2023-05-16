export const getCssTextItalic = (value: boolean | string): string => {
  if (value === true || value === "") {
    return "italic";
  }
  if (value === false) {
    return "normal";
  }
  return value;
};
