const getCssChildOverflow = (value: string): string => {
  if (value === "") {
    return "wrap";
  }
  if (value === "visible") {
    return "nowrap";
  }
  if (value === "reverse") {
    return "wrap-reverse";
  }
  return value;
};

export default getCssChildOverflow;
