import { SparkProgram } from "../types/SparkProgram";

const getCharactersWhoSpokeBeforeLine = (
  program: SparkProgram,
  line: number,
  includeCharacterParenthetical = true
) => {
  const lines = program.metadata?.lines;
  if (!lines) {
    return [];
  }
  const previousCharacters = new Set<string>();
  for (let i = line - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (line) {
      const characterName = line.characterName || "";
      const characterParenthetical = line.characterParenthetical || "";
      if (characterName) {
        let character = characterName;
        if (includeCharacterParenthetical && characterParenthetical) {
          character += " " + characterParenthetical;
        }
        previousCharacters.add(character);
      }
    }
  }
  return Array.from(previousCharacters);
};

export default getCharactersWhoSpokeBeforeLine;
