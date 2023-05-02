const isValidNumber = (v: string) => !Number.isNaN(Number(v));

export const getCssUnit = (
  value: string | number,
  defaultUnit: string
): string => {
  if (typeof value === "number") {
    return `${value}${defaultUnit}`;
  }
  if (value.startsWith("var(")) {
    return value;
  }
  return value
    .split(" ")
    .map((part) => (isValidNumber(part) ? `${part}${defaultUnit}` : part))
    .join(" ");
};
