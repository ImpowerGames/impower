const getCssFilter = (value: string): string => {
  if (
    value.startsWith("blur(") ||
    value.startsWith("brightness(") ||
    value.startsWith("contrast(") ||
    value.startsWith("drop-shadow(") ||
    value.startsWith("grayscale(") ||
    value.startsWith("hue-rotate(") ||
    value.startsWith("invert(") ||
    value.startsWith("opacity(") ||
    value.startsWith("sepia(") ||
    value.startsWith("saturate(")
  ) {
    return value;
  }
  return `var(--theme_filter-${value})`;
};

export default getCssFilter;
