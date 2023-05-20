const getCssEase = (value: string | null, defaultValue = "linear"): string => {
  if (!value) {
    return defaultValue;
  }
  if (
    value === "none" ||
    value === "linear" ||
    value === "ease" ||
    value === "ease-in" ||
    value === "ease-out" ||
    value === "ease-in-out" ||
    value === "step-start" ||
    value === "step-end" ||
    value.startsWith("var(") ||
    value.startsWith("cubic-bezier(") ||
    value.startsWith("steps(")
  ) {
    return value;
  }
  return `var(--s-easing-${value})`;
};

export default getCssEase;