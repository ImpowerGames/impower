import {
  getSectionAtLine,
  SparkSection,
  SparkStruct,
  SparkToken,
} from "../../../../sparkdown/src";
import { CommandData } from "../../data";
import { generateCommand } from "./generateCommand";

export const getPreviewCommand = (
  result: {
    tokens: SparkToken[];
    tokenLines: Record<number, number>;
    sections?: Record<string, SparkSection>;
    structs?: Record<string, SparkStruct>;
  },
  line: number
): CommandData | null | undefined => {
  if (!result) {
    return undefined;
  }
  if (!line) {
    return undefined;
  }
  let tokenIndex = result.tokenLines[line] || -1;
  let token = result.tokens[tokenIndex];
  if (!token) {
    return null;
  }
  while (tokenIndex < result.tokens.length && token?.skipToNextPreview) {
    tokenIndex += 1;
    token = result.tokens[tokenIndex];
  }
  if (!token) {
    return null;
  }
  const [sectionId] = getSectionAtLine(line, result?.sections || {});
  const runtimeCommand = generateCommand(token, sectionId);
  return runtimeCommand;
};
