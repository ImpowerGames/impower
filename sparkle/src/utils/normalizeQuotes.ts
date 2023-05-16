const QUOTE_REGEX = /([\\]["]|["'`])/g;

export const normalizeQuotes = (str: string): string => {
  return str.replace(QUOTE_REGEX, "'");
};
