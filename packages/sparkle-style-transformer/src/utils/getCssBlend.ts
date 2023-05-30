const getCssBlend = (value: string): string => {
  if (value === "") {
    return "normal";
  }
  return value;
};

export default getCssBlend;
