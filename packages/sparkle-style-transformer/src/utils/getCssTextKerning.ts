const getCssTextLeading = (value: string): string => {
  if (
    value === "none" ||
    value === "xs" ||
    value === "sm" ||
    value === "md" ||
    value === "lg" ||
    value === "xl"
  ) {
    return `var(--s-text-kerning-${value})`;
  }
  return value;
};

export default getCssTextLeading;
