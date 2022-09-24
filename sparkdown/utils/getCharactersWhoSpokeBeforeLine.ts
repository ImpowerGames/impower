import { SparkParseResult } from "../types/SparkParseResult";
import { trimCharacterExtension } from "./trimCharacterExtension";
import { trimCharacterForceSymbol } from "./trimCharacterForceSymbol";

export const getCharactersWhoSpokeBeforeLine = (
  result: SparkParseResult,
  line: number
) => {
  let searchIndex = 0;
  if (result.tokenLines[line - 1]) {
    searchIndex = result.tokenLines[line - 1];
  }
  let stopSearch = false;
  const previousCharacters: string[] = [];
  let lastCharacter = "";
  while (searchIndex > 0 && !stopSearch) {
    const token = result.tokens[searchIndex - 1];
    if (token.type === "character") {
      const name = trimCharacterForceSymbol(
        trimCharacterExtension(token.content || "")
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
    searchIndex--;
  }
  if (lastCharacter) {
    previousCharacters.push(lastCharacter);
  }
  return previousCharacters;
};
