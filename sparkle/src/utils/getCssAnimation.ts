export const getCssAnimation = (value: string): string => {
  if (
    !value ||
    value === "none" ||
    value.includes(" ") ||
    value.startsWith("var(")
  ) {
    return value;
  }
  return `var(--s-animation-${value})`;
};
