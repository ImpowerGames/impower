export const getCSSPropertyName = (name: string, separator = "-"): string => {
  const cssProp = name
    .replace(/([a-z](?=[A-Z]))/g, `$1${separator}`)
    .replace(/([_])/g, separator)
    .toLowerCase();
  if (cssProp.startsWith("webkit-")) {
    return `-${cssProp}`;
  }
  return cssProp;
};
