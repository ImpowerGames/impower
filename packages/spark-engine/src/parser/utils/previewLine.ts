import { Context } from "../classes/Context";
import { getPreviewCommand } from "./getPreviewCommand";
import { getPreviewStruct } from "./getPreviewStruct";

export const previewLine = (
  context: Context,
  line: number,
  instant: boolean,
  debug: boolean
) => {
  const program = context.programs[context.entryProgramId];
  if (program) {
    const runtimeCommand = getPreviewCommand(program, line);
    if (runtimeCommand) {
      const commandRunner = context?.runner?.getCommandRunner(
        runtimeCommand.reference.typeId
      );
      if (commandRunner) {
        context.game.ui.loadTheme(context.game.logic.valueMap);
        context.game.ui.loadStyles(context.game.logic.valueMap);
        context.game.ui.loadUI(context.game.logic.valueMap);
        commandRunner.onPreview(context.game, runtimeCommand, {
          instant,
          debug,
        });
      }
    } else {
      const previewStruct = getPreviewStruct(program, line);
      if (previewStruct?.type === "style") {
        context.game.ui.loadStyles(context.game.logic.valueMap);
      }
      if (previewStruct?.type === "ui") {
        context.game.ui.hideUI(
          ...Object.keys(context.game.logic.valueMap?.["ui"] || {})
        );
        context.game.ui.loadStyles(context.game.logic.valueMap);
        context.game.ui.loadUI(context.game.logic.valueMap, previewStruct.name);
        context.game.ui.showUI(previewStruct.name);
      }
    }
  }
};
