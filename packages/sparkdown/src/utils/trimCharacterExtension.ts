const CHARACTER_EXTENSION_REGEX = /[ \t]*(\(.*\))[ \t]*([ \t]*\^)?$/;

/**
 * Trims character extensions, for example the parentheses part in `JOE (on the radio)`
 */
const trimCharacterExtension = (character: string): string =>
  character.replace(CHARACTER_EXTENSION_REGEX, "");

export default trimCharacterExtension;
