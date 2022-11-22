import {
  getScopedValueContext,
  getSectionAtLine,
  SparkSection,
  SparkStruct,
  SparkToken,
} from "../../../../sparkdown";
import { SparkContext } from "../classes/SparkContext";
import { generateStructObjects } from "./generateStructObjects";
import { getPreviewCommand } from "./getPreviewCommand";
import { getPreviewStruct } from "./getPreviewStruct";

export const previewLine = (
  context: SparkContext,
  result: {
    tokens: SparkToken[];
    tokenLines: Record<number, number>;
    sections?: Record<string, SparkSection>;
    structs?: Record<string, SparkStruct>;
  },
  line: number,
  instant: boolean,
  debug: boolean
) => {
  const runtimeCommand = getPreviewCommand(result, line);
  if (runtimeCommand) {
    const commandRunner = context?.runner?.getRunner(runtimeCommand.reference);
    if (commandRunner) {
      const [sectionId] = getSectionAtLine(line, result?.sections || {});
      const [, valueMap] = getScopedValueContext(
        sectionId,
        result?.sections || {}
      );
      const objectMap = generateStructObjects(result?.structs || {});
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
      const objectMap = generateStructObjects(result?.structs || {});
      context.game.ui.loadStyles(objectMap);
    }
    if (previewStruct?.type === "ui") {
      const objectMap = generateStructObjects(result?.structs || {});
      context.game.ui.loadUI(objectMap, previewStruct.name);
    }
  }
};
