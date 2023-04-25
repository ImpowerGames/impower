const CAMEL_CASE_REGEX = /([a-z](?=[A-Z]))/g;

export const camelCaseToKebabCase = (str: string): string => {
  return str.replace(CAMEL_CASE_REGEX, `$1-`).toLowerCase();
};
