export const splitCamelCaseString = (name: string, separator = " "): string => {
  return name.replace(/([a-z](?=[A-Z]))/g, `$1${separator}`);
};
