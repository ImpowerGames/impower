const getCssTextAlign = (value: string): string => {
  if (value === "") {
    return "center";
  }
  return value;
};

export default getCssTextAlign;
