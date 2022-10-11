import {
  getSectionAtLine,
  SparkSection,
  SparkStruct,
  SparkToken,
} from "../../../../sparkdown";
import { generateCommand } from "./generateCommand";

export const getPreviewCommand = (
  result: {
    tokens: SparkToken[];
    tokenLines: Record<number, number>;
    sections?: Record<string, SparkSection>;
    structs?: Record<string, SparkStruct>;
  },
  line: number
) => {
  if (!result) {
    return undefined;
  }
  if (!line) {
    return undefined;
  }
  let tokenIndex = result.tokenLines[line];
  let token = result.tokens[tokenIndex];
  if (token) {
    while (tokenIndex < result.tokens.length && token.skipToNextPreview) {
      tokenIndex += 1;
      token = result.tokens[tokenIndex];
    }
    const [sectionId] = getSectionAtLine(line, result?.sections || {});
    const runtimeCommand = generateCommand(token, sectionId);
    return runtimeCommand;
  }
  return null;
};
