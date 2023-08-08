import { SparkProgram } from "../../../../sparkdown/src";
import { CommandData } from "../../data";
import { getPreviewCommand } from "./getPreviewCommand";

export const getPreviousPreviewCommand = (
  program: SparkProgram,
  line: number
): CommandData | null | undefined => {
  const currentPreviewCommand = getPreviewCommand(program, line);
  const currentLine = currentPreviewCommand ? currentPreviewCommand.line : line;
  for (let i = currentLine; i >= 0; i -= 1) {
    const prevPreviewCommand = getPreviewCommand(program, i);
    if (
      prevPreviewCommand &&
      prevPreviewCommand.line !== currentPreviewCommand?.line
    ) {
      return prevPreviewCommand;
    }
  }
  return null;
};
