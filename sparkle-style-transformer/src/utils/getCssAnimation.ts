const getCssAnimation = (value: string, suffix = ""): string => {
  if (!value || value === "none" || value.startsWith("var(")) {
    return value;
  }
  return value
    .split(" ")
    .map((v) => `var(--s-animation-${v}${suffix}, var(--s-animation-${v}))`)
    .join(", ");
};

export default getCssAnimation;
