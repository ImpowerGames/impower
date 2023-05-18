const getCssAnimation = (value: string): string => {
  if (!value || value === "none" || value.startsWith("var(")) {
    return value;
  }
  return value
    .split(" ")
    .map((v) => `var(--s-animation-${v})`)
    .join(", ");
};

export default getCssAnimation;
