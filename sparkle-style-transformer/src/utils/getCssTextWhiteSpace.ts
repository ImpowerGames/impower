const getCssTextWhiteSpace = (value: string): string => {
  if (
    value === "" ||
    value == "visible" ||
    value === "clip" ||
    value === "ellipsis"
  ) {
    return "nowrap";
  }
  if (value === "wrap") {
    return "break-spaces";
  }
  return value;
};

export default getCssTextWhiteSpace;
