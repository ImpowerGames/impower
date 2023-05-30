const getCssTextUnderline = (value: string): string => {
  if (value === "") {
    return "underline";
  }
  if (!value) {
    return "";
  }
  return value;
};

export default getCssTextUnderline;
