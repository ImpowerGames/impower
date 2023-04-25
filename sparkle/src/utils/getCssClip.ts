export const getCssClip = (value: string): string => {
  if (value === "" || value === "circle") {
    return "circle(50%)";
  }
  if (
    value === "none" ||
    value.startsWith("var(") ||
    value.startsWith("inset(") ||
    value.startsWith("circle(") ||
    value.startsWith("ellipse(") ||
    value.startsWith("polygon(") ||
    value.startsWith("path(")
  ) {
    return value;
  }
  return `var(--s-clip-${value})`;
};
