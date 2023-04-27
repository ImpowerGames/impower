const isValidNumber = (v: string) => !Number.isNaN(Number(v));

export const getCssUnit = (value: string, defaultUnit: string): string => {
  if (value.startsWith("var(")) {
    return value;
  }
  return value
    .split(" ")
    .map((part) => (isValidNumber(part) ? `${part}${defaultUnit}` : part))
    .join(" ");
};
