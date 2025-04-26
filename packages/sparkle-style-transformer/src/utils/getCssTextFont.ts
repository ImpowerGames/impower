const getCssTextFont = (value: string): string => {
  if (value === "sans" || value === "serif" || value === "mono") {
    return `var(--theme_font-${value})`;
  }
  return value;
};

export default getCssTextFont;
