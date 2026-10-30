export const NAME_CHAR = /[\p{L}\p{N}_]/u;

export const JOINING_PAIRS: ReadonlySet<string> = new Set([
  "--",
  "..",
  "==",
  "~=",
  "<=",
  ">=",
  "//",
  "::",
  "->",
  "[[",
  "[=",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "^=",
]);

export const isNameChar = (char: string): boolean => NAME_CHAR.test(char);

export const joinsAcrossSpace = (before: string, after: string): boolean =>
  (isNameChar(before) && isNameChar(after)) ||
  JOINING_PAIRS.has(before + after);
