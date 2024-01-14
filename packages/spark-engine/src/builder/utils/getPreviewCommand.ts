import type { SparkProgram } from "../../../../sparkdown/src/types/SparkProgram";
import type { CommandData } from "../../game/logic/types/CommandData";
import generateCommand from "./generateCommand";
import getSectionAtLine from "./getSectionAtLine";

const getPreviewCommand = (
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
      const sectionId = getSectionAtLine(line, program?.sections || {});
      const runtimeCommand = generateCommand(token, "", sectionId, tokenIndex);
      if (runtimeCommand) {
        return runtimeCommand;
      }
    }
  }
  return null;
};

export default getPreviewCommand;
