export const addForceSymbolToCharacter = (characterName: string): string => {
  const containsLowerCase = (text: string): boolean => /[\p{Ll}]/u.test(text);
  return containsLowerCase(characterName) ? `@${characterName}` : characterName;
};
