import type { PathLocationTable } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import {
  findPathRow,
  pathAtRow,
} from "@impower/sparkdown/src/compiler/utils/pathLocationTable";

/**
 * The story path a preview of `from` should divert into: the closest path that
 * owns the line, among those a preview may target (binding evaluators are not
 * — see the table's previewable rows).
 *
 * A line that `>` breaks holds several beats. A preview shows the line's last
 * beat (`"last"`), and PLAY from the line starts at its first (`"first"`).
 */
export const findClosestPath = (
  from: { file: string; line: number },
  pathLocations: PathLocationTable | undefined,
  scripts: string[],
  beat: "first" | "last" = "first",
) => {
  const { file, line } = from;
  if (file == null || line == null) {
    return null;
  }
  const row = findPathRow(
    pathLocations,
    scripts.indexOf(file),
    line,
    true,
    beat,
  );
  const path = row < 0 ? undefined : pathAtRow(pathLocations, row);
  const parentPath = path?.split(".").slice(0, -1).join(".");
  if (parentPath?.endsWith(".$s")) {
    // If we are inside choice start content, begin from start of choice
    const grandParentPath = parentPath?.split(".").slice(0, -1).join(".");
    return grandParentPath + ".0";
  }
  return path ?? null;
};
