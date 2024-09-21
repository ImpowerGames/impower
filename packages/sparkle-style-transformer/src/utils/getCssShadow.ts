const getCssShadow = (value: string): string => {
  if (value === "none") {
    return value;
  }
  const isValidNumber = !Number.isNaN(Number(value));
  if (isValidNumber) {
    return `var(--s-shadow-box-${value})`;
  }
  return value;
};

export default getCssShadow;
