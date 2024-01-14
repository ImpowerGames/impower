import type { SparkProgram } from "../../../../sparkdown/src/types/SparkProgram";
import type { CommandData } from "../../game/logic/types/CommandData";
import getPreviewCommand from "./getPreviewCommand";

const getNextPreviewCommand = (
  program: SparkProgram,
  line: number
): CommandData | null | undefined => {
  const currentPreviewCommand = getPreviewCommand(program, line);
  const currentLine = currentPreviewCommand
    ? currentPreviewCommand.source.line
    : line;
  const lastLine = program.metadata.lineCount;
  if (!lastLine) {
    return null;
  }
  for (let i = currentLine; i <= lastLine; i += 1) {
    const nextPreviewCommand = getPreviewCommand(program, i);
    if (
      nextPreviewCommand &&
      nextPreviewCommand.source.line !== currentPreviewCommand?.source.line
    ) {
      return nextPreviewCommand;
    }
  }
  return null;
};

export default getNextPreviewCommand;
