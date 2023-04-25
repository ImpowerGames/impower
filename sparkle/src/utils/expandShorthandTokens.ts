export const expandShorthandTokens = (
  propValue: string,
  regex: RegExp,
  variablePrefix: string,
  variableSuffix = ""
) => {
  return propValue.replace(regex, `var(${variablePrefix}$1${variableSuffix})`);
};
