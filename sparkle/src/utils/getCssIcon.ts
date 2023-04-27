export const getCssIcon = (value: string, suffix = ""): string => {
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
  return `var(--s-icon-${value}${suffix}, var(--s-icon-${value}))`;
};
