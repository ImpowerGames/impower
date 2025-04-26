const getCssRatio = (value: string): string => {
  if (value === "") {
    return "1";
  }
  if (value.includes("/")) {
    return value;
  }
  if (value.includes(":")) {
    return value.replace(":", "/");
  }
  return `var(--theme_ratio-${value})`;
};

export default getCssRatio;
