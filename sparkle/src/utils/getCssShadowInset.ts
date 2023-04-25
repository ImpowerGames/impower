export const getCssShadowInset = (value: string): string => {
  const isValidNumber = !Number.isNaN(Number(value));
  if (isValidNumber) {
    return `var(--s-shadow-inset-${value})`;
  }
  return value;
};
