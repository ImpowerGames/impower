import { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";

type PathLocationEntry = [string, [number, number, number, number, number]];

/**
 * Index of the path-location entry at (or immediately before) `currentLine`
 * in `currentFile`. Entries are ordered by file then line, so the scan can
 * stop as soon as it passes the target.
 */
const getClosestSourceIndex = (
  allFiles: string[],
  allPathToLocationEntries: PathLocationEntry[],
  currentFile: string | undefined,
  currentLine: number,
): number | null => {
  if (currentFile == null) return null;
  const fileIndex = allFiles.indexOf(currentFile);
  if (fileIndex < 0) return null;
  let closestIndex: number | null = null;
  for (let i = 0; i < allPathToLocationEntries.length; i++) {
    const entry = allPathToLocationEntries[i]!;
    const [, source] = entry;
    if (source) {
      const [currFileIndex, currStartLine] = source;
      if (currFileIndex === fileIndex && currStartLine === currentLine) {
        closestIndex = i;
        break;
      }
      if (currFileIndex === fileIndex && currStartLine > currentLine) {
        closestIndex = i - 1;
        break;
      }
      if (currFileIndex > fileIndex) {
        closestIndex = null;
        break;
      }
    }
  }
  return closestIndex;
};

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
  if (!program) return null;
  const files = Object.keys(program.scripts ?? {});
  const pathLocationEntries = Object.entries(program.pathLocations || {}) as
    PathLocationEntry[];
  const index = getClosestSourceIndex(
    files,
    pathLocationEntries,
    currentFile,
    currentLine,
  );
  if (index == null) return null;
  const entry = pathLocationEntries[index + offset];
  if (entry == null) return null;
  const [uuid, source] = entry;
  if (uuid == null) return null;
  const [fileIndex, lineIndex] = source;
  const file = files[fileIndex];
  if (!file) return null;
  return { file, line: lineIndex };
};
