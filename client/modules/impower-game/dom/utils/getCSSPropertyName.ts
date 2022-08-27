export const getCSSPropertyName = (name: string, separator = "-"): string => {
  const cssProp = name
    .replace(/([a-z](?=[A-Z]))/g, `$1${separator}`)
    .toLowerCase();
  if (cssProp.startsWith("webkit-")) {
    return `-${cssProp}`;
  }
  return cssProp;
};
