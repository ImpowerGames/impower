/**
 * Character names containing lowercase letters need to be prefixed with an `@` symbol
 */
export const addForceSymbolToCharacter = (characterName: string): string => {
  const containsLowerCase = (text: string): boolean => /[\p{Ll}]/u.test(text);
  return containsLowerCase(characterName) ? `@${characterName}` : characterName;
};
