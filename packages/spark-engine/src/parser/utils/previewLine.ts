import {
  getScopedValueContext,
  getSectionAtLine,
  SparkParseResult,
} from "../../../../sparkdown/src";
import { Context } from "../classes/Context";
import { getPreviewCommand } from "./getPreviewCommand";
import { getPreviewStruct } from "./getPreviewStruct";

export const previewLine = (
  context: Context,
  result: SparkParseResult,
  line: number,
  instant: boolean,
  debug: boolean
) => {
  const objectMap = result?.objectMap || {};
  const runtimeCommand = getPreviewCommand(result, line);
  if (runtimeCommand) {
    const commandRunner = context?.runner?.getRunner(runtimeCommand.reference);
    if (commandRunner) {
      const [sectionId] = getSectionAtLine(line, result?.sections || {});
      const [, valueMap] = getScopedValueContext(
        sectionId,
        result?.sections || {}
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
    const previewStruct = getPreviewStruct(result, line);
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
