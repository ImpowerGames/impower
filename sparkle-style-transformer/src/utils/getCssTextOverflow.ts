const getCssTextOverflow = (value: string): string => {
  if (value === "" || value === "visible" || value === "wrap") {
    return "clip";
  }
  return value;
};

export default getCssTextOverflow;
