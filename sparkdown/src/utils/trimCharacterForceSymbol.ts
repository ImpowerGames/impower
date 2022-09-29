/**
 * Trims the `@` symbol necessary in character names if they contain lower-case letters, i.e. `@McCONNOR`
 */
export const trimCharacterForceSymbol = (character: string): string =>
  character.replace(/^[ \t]*@/, "");
