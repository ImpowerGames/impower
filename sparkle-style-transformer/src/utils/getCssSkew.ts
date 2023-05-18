const getCssSkew = (value: string): string => {
  if (value === "none") {
    return "0";
  }
  return value;
};

export default getCssSkew;
