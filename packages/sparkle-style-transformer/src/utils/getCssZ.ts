const isValidNumber = (v: string) => !Number.isNaN(Number(v));

const getCssZ = (value: string): string => {
  if (isValidNumber(value) || value.startsWith("var(")) {
    return value;
  }
  return `var(--theme_z-index-${value})`;
};

export default getCssZ;
