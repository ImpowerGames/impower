import { SparkParseResult } from "../types/SparkParseResult";
import { trimCharacterExtension } from "./trimCharacterExtension";
import { trimCharacterForceSymbol } from "./trimCharacterForceSymbol";

export const getCharactersWhoSpokeBeforeLine = (
  result: SparkParseResult,
  line: number
) => {
  let searchIndex = 0;
  const prevLine = result.tokenLines[line - 1];
  if (prevLine) {
    searchIndex = prevLine;
  }
  let stopSearch = false;
  const previousCharacters: string[] = [];
  let lastCharacter = "";
  while (searchIndex > 0 && !stopSearch) {
    const token = result.tokens[searchIndex - 1];
    if (token) {
      if (token.type === "dialogue_character") {
        const name = trimCharacterForceSymbol(
          trimCharacterExtension(token.text || "")
        ).trim();
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
