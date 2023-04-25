export const getCssShadow = (value: string): string => {
  const isValidNumber = !Number.isNaN(Number(value));
  if (isValidNumber) {
    return `var(--s-shadow-drop-${value})`;
  }
  return value;
};
