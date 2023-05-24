const getCssPosition = (value: string): string => {
  if (value === "default") {
    return "static";
  }
  if (value.startsWith("sticky")) {
    return "sticky";
  }
  if (value.startsWith("absolute")) {
    return "absolute";
  }
  if (value.startsWith("fixed")) {
    return "fixed";
  }
  if (value.startsWith("relative")) {
    return "relative";
  }
  return value;
};

export default getCssPosition;
