const isValidNumber = (v: string) => !Number.isNaN(Number(v));

export const getCssZ = (value: string): string => {
  if (isValidNumber(value) || value.startsWith("var(")) {
    return value;
  }
  return `var(--s-z-index-${value})`;
};
