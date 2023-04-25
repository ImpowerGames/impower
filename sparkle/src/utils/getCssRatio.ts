export const getCssRatio = (value: string): string => {
  if (value?.includes(":")) {
    return value.replace(":", "/");
  }
  return value;
};
