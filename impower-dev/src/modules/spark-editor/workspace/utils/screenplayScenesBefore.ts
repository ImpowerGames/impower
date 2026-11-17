import type { FileData } from "@impower/spark-editor-protocol/src/types";
import ScreenplayParser from "../../../../../../packages/sparkdown-screenplay/src/classes/ScreenplayParser";
import ScreenplayTypesetter from "../../../../../../packages/sparkdown-screenplay/src/classes/ScreenplayTypesetter";
import { bundleOrder } from "./scriptBundle";

const numberedScenes = new Map<string, { text: string; count: number }>();

const numberedScenesIn = (file: FileData) => {
  const text = file.text ?? "";
  const known = numberedScenes.get(file.uri);
  if (known?.text === text) return known.count;
  let count = 0;
  for (const span of new ScreenplayTypesetter().compose(new ScreenplayParser().parse(text))) {
    if ("lines" in span) count += span.lines.filter((line) => line.scene !== undefined).length;
  }
  numberedScenes.set(file.uri, { text, count });
  return count;
};

export const screenplayScenesBefore = (
  files: FileData[],
  uri: string,
  getRelativePath: (uri: string) => string,
): number => {
  let total = 0;
  for (const file of bundleOrder(files, "main.sd", getRelativePath)) {
    if (file.uri === uri) return total;
    total += numberedScenesIn(file);
  }
  return 0;
};
