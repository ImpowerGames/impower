const getCssMask = (value: string): string => {
  return `var(--theme_mask-${value})`;
};

export default getCssMask;
