import {
  getScopedValueContext,
  getSectionAtLine,
  SparkProgram,
} from "../../../../sparkdown/src";
import { Context } from "../classes/Context";
import { getPreviewCommand } from "./getPreviewCommand";
import { getPreviewStruct } from "./getPreviewStruct";

export const previewLine = (
  context: Context,
  program: SparkProgram,
  line: number,
  instant: boolean,
  debug: boolean
) => {
  const objectMap = program?.objectMap || {};
  const runtimeCommand = getPreviewCommand(program, line);
  if (runtimeCommand) {
    const commandRunner = context?.runner?.getRunner(runtimeCommand.reference);
    if (commandRunner) {
      const [sectionId] = getSectionAtLine(line, program?.sections || {});
      const [, valueMap] = getScopedValueContext(
        sectionId,
        program?.sections || {}
      );
      context.game.ui.loadTheme(objectMap);
      context.game.ui.loadStyles(objectMap);
      context.game.ui.loadUI(objectMap);
      commandRunner.onPreview(context.game, runtimeCommand, {
        valueMap,
        objectMap,
        instant,
        debug,
      });
    }
  } else {
    const previewStruct = getPreviewStruct(program, line);
    if (previewStruct?.type === "style") {
      context.game.ui.loadStyles(objectMap, previewStruct.name);
    }
    if (previewStruct?.type === "ui") {
      context.game.ui.hideUI(...Object.keys(objectMap?.["ui"] || {}));
      context.game.ui.loadStyles(objectMap);
      context.game.ui.loadUI(objectMap, previewStruct.name);
      context.game.ui.showUI(previewStruct.name);
    }
  }
};
