import type { PathLocationTable } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import {
  scriptRowRange,
  startLineAtRow,
} from "@impower/sparkdown/src/compiler/utils/pathLocationTable";

/**
 * The start line of every path located inside `range` of `uri`: the lines a
 * debugger may set a breakpoint on. The table groups a script's rows together,
 * so only that script's rows are read.
 */
export const possibleBreakpointLines = (
  pathLocations: PathLocationTable | undefined,
  scripts: string[],
  search: { uri: string; range: { start: { line: number }; end: { line: number } } },
) => {
  const lines: number[] = [];
  if (!pathLocations) {
    return lines;
  }
  const [start, end] = scriptRowRange(
    pathLocations,
    scripts.indexOf(search.uri),
  );
  for (let row = start; row < end; row++) {
    const line = startLineAtRow(pathLocations, row);
    if (line >= search.range.start.line && line <= search.range.end.line) {
      lines.push(line);
    }
  }
  return lines;
};
