import { SparkProgram } from "../types/SparkProgram";
import trimCharacterExtension from "./trimCharacterExtension";

const getCharactersWhoSpokeBeforeLine = (
  program: SparkProgram,
  line: number
) => {
  let searchIndex = 0;
  const prevLineTokenIndex = program.metadata?.lines?.[line - 1]?.tokens?.[0];
  if (prevLineTokenIndex) {
    searchIndex = prevLineTokenIndex;
  }
  let stopSearch = false;
  const previousCharacters: string[] = [];
  let lastCharacter = "";
  while (searchIndex > 0 && !stopSearch) {
    const token = program.tokens[searchIndex - 1];
    if (token) {
      if (token.type === "dialogue_character") {
        const name = trimCharacterExtension(token.text || "").trim();
        if (!lastCharacter) {
          lastCharacter = name;
        } else if (
          name !== lastCharacter &&
          previousCharacters.indexOf(name) === -1
        ) {
          previousCharacters.push(name);
        }
      } else if (token.type === "scene") {
        stopSearch = true;
      }
    }
    searchIndex--;
  }
  if (lastCharacter) {
    previousCharacters.push(lastCharacter);
  }
  return previousCharacters;
};

export default getCharactersWhoSpokeBeforeLine;
