const REGEX_NEWLINE = /\n/g;
const REGEX_ASTERISK = /\*/g;
const REGEX_UNDERLINE = /_/g;

export const clearFormatting = (text: string): string => {
  return text
    .replace(REGEX_NEWLINE, " ")
    .replace(REGEX_ASTERISK, "")
    .replace(REGEX_UNDERLINE, "");
};
