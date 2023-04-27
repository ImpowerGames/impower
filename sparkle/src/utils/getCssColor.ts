export const getCssColor = (color: string): string => {
  if (color === "current") {
    return "currentColor";
  }
  return `var(--s-color-${color}-70, var(--s-color-${color}))`;
};
