import { SparkProgram } from "../../../../sparkdown/src";
import { CommandData } from "../../data";
import { getPreviewCommand } from "./getPreviewCommand";

export const getNextPreviewCommand = (
  program: SparkProgram,
  line: number
): CommandData | null | undefined => {
  const currentPreviewCommand = getPreviewCommand(program, line);
  const currentLine = currentPreviewCommand ? currentPreviewCommand.line : line;
  const lastToken = program.tokens[program.tokens.length - 1];
  if (!lastToken) {
    return null;
  }
  for (let i = currentLine; i <= lastToken.line; i += 1) {
    const nextPreviewCommand = getPreviewCommand(program, i);
    if (
      nextPreviewCommand &&
      nextPreviewCommand.line !== currentPreviewCommand?.line
    ) {
      return nextPreviewCommand;
    }
  }
  return null;
};
