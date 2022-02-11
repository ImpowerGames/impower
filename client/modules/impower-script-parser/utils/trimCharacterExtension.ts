/**
 * Trims character extensions, for example the parentheses part in `JOE (on the radio)`
 */
export const trimCharacterExtension = (character: string): string =>
  character.replace(/[ \t]*(\(.*\))[ \t]*([ \t]*\^)?$/, "");
