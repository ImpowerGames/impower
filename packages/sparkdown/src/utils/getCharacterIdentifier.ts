export const getCharacterIdentifier = (characterName: string): string => {
  return characterName
    .replace(/([ ])/g, "_")
    .replace(/([^\p{L}\p{N}])/gu, "")
    .toLowerCase();
};
