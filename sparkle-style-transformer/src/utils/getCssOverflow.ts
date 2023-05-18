const getCssOverflow = (value: boolean | string): string => {
  if (value === true || value === "") {
    return "visible";
  }
  if (value === false) {
    return "clip";
  }
  return value;
};

export default getCssOverflow;
