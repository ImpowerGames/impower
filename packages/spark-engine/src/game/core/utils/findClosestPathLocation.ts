import type { PathLocationTable } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import {
  findPathRow,
  locationAtRow,
  pathAtRow,
} from "@impower/sparkdown/src/compiler/utils/pathLocationTable";
import type { ScriptLocation } from "../types/ScriptLocation";

/**
 * The path that owns a source line: the first one in the script whose range
 * covers the line, or, when none does, the first one that starts after it.
 * Found by binary search over the program's path-location table, which is
 * ordered by script, then start line, then start column.
 */
export const findClosestPathLocation = (
  breakpoint: { file: string; line: number },
  pathLocations: PathLocationTable | undefined,
  scripts: string[],
): [string, ScriptLocation] | null => {
  if (breakpoint.file == null || breakpoint.line == null) {
    return null;
  }
  const row = findPathRow(
    pathLocations,
    scripts.indexOf(breakpoint.file),
    breakpoint.line,
    false,
  );
  if (row < 0) {
    return null;
  }
  return [
    pathAtRow(pathLocations, row)!,
    locationAtRow(pathLocations, row) as ScriptLocation,
  ];
};
