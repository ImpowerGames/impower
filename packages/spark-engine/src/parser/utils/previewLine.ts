import { compile } from "../../../../spark-evaluate/src/utils/compile";
import getScopedValueContext from "../../../../sparkdown/src/utils/getScopedValueContext";
import getSectionAtLine from "../../../../sparkdown/src/utils/getSectionAtLine";
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
    const typeMap = program?.typeMap || {};
    const runtimeCommand = getPreviewCommand(program, line);
    if (runtimeCommand) {
      const commandRunner = context?.runner?.getCommandRunner(
        runtimeCommand.reference.typeId
      );
      if (commandRunner) {
        const [sectionId] = getSectionAtLine(line, program?.sections || {});
        const [, valueMap] = getScopedValueContext(
          sectionId,
          program?.sections || {},
          compile
        );
        context.game.ui.loadTheme(typeMap);
        context.game.ui.loadStyles(typeMap);
        context.game.ui.loadUI(typeMap);
        commandRunner.onPreview(context.game, runtimeCommand, {
          valueMap,
          typeMap,
          instant,
          debug,
        });
      }
    } else {
      const previewStruct = getPreviewStruct(program, line);
      if (previewStruct?.type === "style") {
        context.game.ui.loadStyles(typeMap, previewStruct.name);
      }
      if (previewStruct?.type === "ui") {
        context.game.ui.hideUI(...Object.keys(typeMap?.["ui"] || {}));
        context.game.ui.loadStyles(typeMap);
        context.game.ui.loadUI(typeMap, previewStruct.name);
        context.game.ui.showUI(previewStruct.name);
      }
    }
  }
};
