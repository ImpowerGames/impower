const getCssShadowInset = (value: string): string => {
  const isValidNumber = !Number.isNaN(Number(value));
  if (isValidNumber) {
    return `var(--theme_shadow-inset-${value})`;
  }
  return value;
};

export default getCssShadowInset;
