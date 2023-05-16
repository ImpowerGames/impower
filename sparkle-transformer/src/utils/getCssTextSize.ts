export const getCssTextSize = (value: string): string => {
  if (
    value === "2xs" ||
    value === "xs" ||
    value === "sm" ||
    value === "md" ||
    value === "lg" ||
    value === "xl" ||
    value === "2xl" ||
    value === "3xl" ||
    value === "4xl" ||
    value === "5xl" ||
    value === "6xl" ||
    value === "7xl" ||
    value === "8xl" ||
    value === "9xl"
  ) {
    return `var(--s-text-${value}-font-size)`;
  }
  return value;
};
