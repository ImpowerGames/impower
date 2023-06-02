export const getCharacterName = (text: string): string => {
  let character = text;
  if (!character) {
    return "";
  }
  const p = character.indexOf("(");
  if (p !== -1) {
    character = character.substring(0, p);
  }
  character = character.trim();
  return character;
};
