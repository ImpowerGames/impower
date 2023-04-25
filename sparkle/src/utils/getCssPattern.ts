export const getCssPattern = (value: string): string => {
  if (!value) {
    return "none";
  }
  if (
    value === "none" ||
    value.startsWith("var(") ||
    value.startsWith("url(")
  ) {
    return value;
  }
  return `var(--s-pattern-${value})`;
};
