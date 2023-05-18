const getCssSelectable = (value: boolean | string): string => {
  if (value === true || value === "") {
    return "auto";
  }
  if (value === false) {
    return "none";
  }
  return value;
};

export default getCssSelectable;
