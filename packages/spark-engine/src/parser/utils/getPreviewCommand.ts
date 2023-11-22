import { SparkProgram } from "../../../../sparkdown/src";
import getSectionAtLine from "../../../../sparkdown/src/utils/getSectionAtLine";
import { CommandData } from "../../data";
import { generateCommand } from "./generateCommand";

export const getPreviewCommand = (
  program: SparkProgram,
  line: number
): CommandData | null | undefined => {
  if (!program) {
    return undefined;
  }
  if (line == null) {
    return undefined;
  }
  const lineTokens = program.metadata?.lines?.[line]?.tokens;
  if (!lineTokens) {
    return null;
  }
  for (let i = 0; i < lineTokens.length; i += 1) {
    const tokenIndex = lineTokens[i]!;
    const token = program.tokens[tokenIndex];
    if (token) {
      const [sectionId] = getSectionAtLine(line, program?.sections || {});
      const runtimeCommand = generateCommand(token, "", sectionId);
      if (runtimeCommand) {
        return runtimeCommand;
      }
    }
  }
  return null;
};
