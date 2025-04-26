const getCssTextLeading = (value: string): string => {
  if (
    value === "none" ||
    value === "xs" ||
    value === "sm" ||
    value === "md" ||
    value === "lg" ||
    value === "xl"
  ) {
    return `var(--theme_text-leading-${value})`;
  }
  return value;
};

export default getCssTextLeading;
