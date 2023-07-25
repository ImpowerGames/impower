const getCssOutlineStyle = (value: string): string => {
  if (value === "") {
    return "solid";
  }
  return value;
};

export default getCssOutlineStyle;
