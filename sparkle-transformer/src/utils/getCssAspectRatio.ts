export const getCssAspectRatio = (value: string): string => {
  if (value === "") {
    return "1";
  }
  if (value.includes("/")) {
    return value;
  }
  if (value.includes(":")) {
    return value.replace(":", "/");
  }
  return `var(--s-ratio-${value})`;
};
