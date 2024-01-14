import type { SparkProgram } from "../../../../sparkdown/src/types/SparkProgram";
import type { CommandData } from "../../data";
import { getPreviewCommand } from "./getPreviewCommand";

export const getPreviousPreviewCommand = (
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
