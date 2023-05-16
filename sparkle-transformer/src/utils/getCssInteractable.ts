export const getCssInteractable = (value: boolean | string): string => {
  if (value === true || value === "") {
    return "auto";
  }
  if (value === false) {
    return "none";
  }
  return value;
};
