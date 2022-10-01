import {
  getScopedValueContext,
  getSectionAtLine,
  SparkParseResult,
} from "../../../../sparkdown";
import { loadStyles, loadUI } from "../../dom";
import { generateEntityObjects } from "../../parser";
import { SparkGameRunner } from "../../runner";
import { getPreviewCommand } from "./getPreviewCommand";
import { getPreviewEntity } from "./getPreviewEntity";

export const previewLine = (
  gameRunner: SparkGameRunner,
  result: SparkParseResult,
  line: number,
  instant: boolean,
  debug: boolean
) => {
  const runtimeCommand = getPreviewCommand(result, line);
  if (runtimeCommand) {
    const commandRunner = gameRunner.getRunner(runtimeCommand.reference);
    if (commandRunner) {
      const [sectionId] = getSectionAtLine(line, result);
      const [, valueMap] = getScopedValueContext(
        sectionId,
        result?.sections || {}
      );
      const objectMap = generateEntityObjects(result?.entities || {});
      commandRunner.onPreview(runtimeCommand, {
        valueMap,
        objectMap,
        instant,
        debug,
      });
    }
  } else {
    const previewEntity = getPreviewEntity(result, line);
    if (previewEntity?.type === "style") {
      const objectMap = generateEntityObjects(result?.entities || {});
      loadStyles(objectMap, ...Object.keys(objectMap?.style || {}));
    }
    if (previewEntity?.type === "ui") {
      const objectMap = generateEntityObjects(result?.entities || {});
      loadUI(objectMap, previewEntity.name);
    }
  }
};
