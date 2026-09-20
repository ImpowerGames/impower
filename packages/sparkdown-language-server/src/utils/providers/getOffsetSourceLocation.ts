import { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import {
  pathLocationCount,
  scriptRowRange,
  startLineAtRow,
} from "@impower/sparkdown/src/compiler/utils/pathLocationTable";

/**
 * The source position `offset` path-locations away from (`currentFile`,
 * `currentLine`) — i.e. the previous (-1) or next (+1) beat. Powers the
 * editor's PageUp/PageDown navigation.
 *
 * This lives server-side deliberately: `pathLocations` has ~12k entries on a
 * feature-length script (~600KB serialized), and shipping it to the client
 * with every compile just to answer an occasional keypress dominated the
 * per-keystroke payload. Asking for one location on demand is a few bytes.
 */
export const getOffsetSourceLocation = (
  program: SparkProgram | undefined,
  currentFile: string | undefined,
  currentLine: number,
  offset: number,
): { file: string; line: number } | null => {
  if (!program || currentFile == null) {
    return null;
  }
  const table = program.pathLocations;
  const files = Object.keys(program.scripts ?? {});
  const fileIndex = files.indexOf(currentFile);
  if (!table || fileIndex < 0) {
    return null;
  }
  // The rows of a script are ordered by start line, so the row at or before
  // `currentLine` is found by binary search within that script's range.
  const [start, end] = scriptRowRange(table, fileIndex);
  let lo = start;
  let hi = end;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (startLineAtRow(table, mid) < currentLine) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  if (lo >= end) {
    // Every row of the script is before the line; there is no row to count
    // from.
    return null;
  }
  // The row counted from is the one on the line, or the one before the first
  // row past it. Rows are numbered across the whole program, so an offset may
  // land in a neighbouring script, as a linear walk of all of them would.
  const from = startLineAtRow(table, lo) === currentLine ? lo : lo - 1;
  const row = from + offset;
  if (row < 0 || row >= pathLocationCount(table)) {
    return null;
  }
  const at = row * 5;
  const file = files[table.values[at]!];
  if (!file) {
    return null;
  }
  return { file, line: table.values[at + 1]! };
};
