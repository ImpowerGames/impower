const getCssGradient = (value: string): string => {
  if (!value) {
    return "none";
  }
  if (
    value === "none" ||
    value.startsWith("var(") ||
    value.startsWith("linear-gradient(") ||
    value.startsWith("radial-gradient(") ||
    value.startsWith("conic-gradient(")
  ) {
    return value;
  }
  return `var(--theme_gradient-${value})`;
};

export default getCssGradient;
