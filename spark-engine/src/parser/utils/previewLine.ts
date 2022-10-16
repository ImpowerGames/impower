import {
  getScopedValueContext,
  getSectionAtLine,
  SparkSection,
  SparkStruct,
  SparkToken,
} from "../../../../sparkdown";
import { loadStyles, loadUI } from "../../dom";
import { SparkGameRunner } from "../../runner";
import { generateStructObjects } from "./generateStructObjects";
import { getPreviewCommand } from "./getPreviewCommand";
import { getPreviewStruct } from "./getPreviewStruct";

export const previewLine = (
  gameRunner: SparkGameRunner,
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
    const commandRunner = gameRunner.getRunner(runtimeCommand.reference);
    if (commandRunner) {
      const [sectionId] = getSectionAtLine(line, result?.sections || {});
      const [, valueMap] = getScopedValueContext(
        sectionId,
        result?.sections || {}
      );
      const objectMap = generateStructObjects(result?.structs || {});
      commandRunner.onPreview(runtimeCommand, {
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
      loadStyles(objectMap, ...Object.keys(objectMap?.style || {}));
    }
    if (previewStruct?.type === "ui") {
      const objectMap = generateStructObjects(result?.structs || {});
      loadUI(objectMap, previewStruct.name);
    }
  }
};