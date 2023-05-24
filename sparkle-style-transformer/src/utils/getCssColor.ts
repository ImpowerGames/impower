const getCssColor = (color: string): string => {
  if (color === "current") {
    return "currentColor";
  }
  if (
    color === "none" ||
    color === "transparent" ||
    color === "black" ||
    color === "white" ||
    color.startsWith("#") ||
    color.startsWith("rgb") ||
    color.startsWith("hsl") ||
    color.startsWith("lch")
  ) {
    return color;
  }
  if (!color) {
    return color;
  }
  return `var(--s-color-${color}, var(--s-color-${color}-60))`;
};

export default getCssColor;
