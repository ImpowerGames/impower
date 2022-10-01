import { getSectionAtLine, SparkParseResult } from "../../../../sparkdown";
import { generateCommand } from "../../parser";

export const getPreviewCommand = (result: SparkParseResult, line: number) => {
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
    const [sectionId] = getSectionAtLine(line, result);
    const runtimeCommand = generateCommand(token, sectionId);
    return runtimeCommand;
  }
  return null;
};
