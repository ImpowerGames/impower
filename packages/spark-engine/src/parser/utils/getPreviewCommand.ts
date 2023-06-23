import {
  getSectionAtLine,
  SparkSection,
  SparkStruct,
  SparkToken,
} from "../../../../sparkdown/src";
import { CommandData } from "../../data";
import { generateCommand } from "./generateCommand";

export const getPreviewCommand = (
  program: {
    tokens: SparkToken[];
    metadata: { lines: { tokens: number[] }[] };
    sections?: Record<string, SparkSection>;
    structs?: Record<string, SparkStruct>;
  },
  line: number
): CommandData | null | undefined => {
  if (!program) {
    return undefined;
  }
  if (!line) {
    return undefined;
  }
  let tokenIndex = program.metadata?.lines[line]?.tokens?.[0] || -1;
  let token = program.tokens[tokenIndex];
  if (!token) {
    return null;
  }
  while (tokenIndex < program.tokens.length && token?.skipToNextPreview) {
    tokenIndex += 1;
    token = program.tokens[tokenIndex];
  }
  if (!token) {
    return null;
  }
  const [sectionId] = getSectionAtLine(line, program?.sections || {});
  const runtimeCommand = generateCommand(token, sectionId);
  return runtimeCommand;
};
