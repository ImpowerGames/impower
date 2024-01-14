import type { SparkProgram } from "../../../../sparkdown/src/types/SparkProgram";
import type { CommandData } from "../../game/logic/types/CommandData";
import getPreviewCommand from "./getPreviewCommand";

const getPreviousPreviewCommand = (
  program: SparkProgram,
  line: number
): CommandData | null | undefined => {
  const currentPreviewCommand = getPreviewCommand(program, line);
  const currentLine = currentPreviewCommand
    ? currentPreviewCommand.source.line
    : line;
  for (let i = currentLine; i >= 0; i -= 1) {
    const prevPreviewCommand = getPreviewCommand(program, i);
    if (
      prevPreviewCommand &&
      prevPreviewCommand.source.line !== currentPreviewCommand?.source.line
    ) {
      return prevPreviewCommand;
    }
  }
  return null;
};

export default getPreviousPreviewCommand;
