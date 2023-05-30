const isValidNumber = (v: string) => !Number.isNaN(Number(v));

const getCssUnit = (value: string | number, defaultUnit: string): string => {
  if (typeof value === "number") {
    return `${value}${defaultUnit}`;
  }
  return value
    .split(" ")
    .map((part) => (isValidNumber(part) ? `${part}${defaultUnit}` : part))
    .join(" ");
};

export default getCssUnit;
