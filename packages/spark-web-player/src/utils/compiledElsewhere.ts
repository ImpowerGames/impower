/**
 * Whether `program` was compiled for a script other than the one holding
 * `point`, the point the preview shows: it does not include that script.
 *
 * Opening a script compiles it, and a script the story does not include
 * compiles on its own, into a program that holds only that script. The point
 * cannot be found in such a program, so neither the page nor the worker's game
 * may take it in place of the story's: on a cold start in VS Code every script
 * is open, and when one of these arrived last the preview stayed black for
 * good (#1874). A program that names no scripts, or a preview with no point
 * yet, says nothing either way.
 */
export const compiledElsewhere = (
  program: { scripts?: Record<string, number> },
  point: { file: string } | null | undefined,
): boolean =>
  point != null && program.scripts != null && !(point.file in program.scripts);
