import { ScriptLocation } from "../types/ScriptLocation";
import { findClosestPathLocation } from "./findClosestPathLocation";

export const findClosestPath = (
  from: { file: string; line: number },
  pathLocationEntries: [string, ScriptLocation][],
  scripts: string[]
) => {
  const { file, line } = from;
  if (file == null || line == null) {
    return null;
  }
  const [path] =
    findClosestPathLocation({ file, line }, pathLocationEntries, scripts) || [];
  const parentPath = path?.split(".").slice(0, -1).join(".");
  if (parentPath?.endsWith(".$s")) {
    // If we are inside choice start content, begin from start of choice
    const grandParentPath = parentPath?.split(".").slice(0, -1).join(".");
    return grandParentPath + ".0";
  }
  return path ?? null;
};
