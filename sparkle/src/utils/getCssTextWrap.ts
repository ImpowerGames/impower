export const getCssTextWrap = (value: string): string => {
  if (value === "" || value === "wrap") {
    return "break-spaces";
  }
  return value;
};
