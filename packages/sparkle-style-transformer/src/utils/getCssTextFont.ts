const getCssTextFont = (value: string): string => {
  if (value === "sans" || value === "serif" || value === "mono") {
    return `var(--s-font-${value})`;
  }
  return value;
};

export default getCssTextFont;
