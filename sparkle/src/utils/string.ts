/** Converts the first letter of a string to uppercase */
export const uppercaseFirstLetter = (string: string) => {
  return string.charAt(0).toUpperCase() + string.slice(1);
};
