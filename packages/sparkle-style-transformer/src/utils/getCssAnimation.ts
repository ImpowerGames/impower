const getCssAnimation = (value: string | null, suffix = ""): string => {
  if (!value || value === "none") {
    return "none";
  }
  if (value.startsWith("var(")) {
    return value;
  }
  return value
    .split(" ")
    .map((v) => `var(--theme_animation-${v}${suffix || ""})`)
    .join(", ");
};

export default getCssAnimation;
