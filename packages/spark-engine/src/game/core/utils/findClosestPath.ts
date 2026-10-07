import type { PathLocationTable } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { pathTableLocator } from "@impower/sparkdown/src/compiler/utils/programLocator";

/**
 * The story path a preview of `from` should divert into: the closest path that
 * owns the line, among those a preview may target (binding evaluators are not
 * — see the table's previewable rows), and the start of a choice for a line
 * inside its start content.
 *
 * A line that `>` breaks holds several beats. A preview shows the line's last
 * beat (`"last"`), and PLAY from the line starts at its first (`"first"`).
 *
 * The current engine's accessor answers (`pathTableLocator`, #700), which is
 * what the game and the player resolve a line through; this name stays for
 * the tests that pin the table's lookups.
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
  const address = pathTableLocator(pathLocations, scripts).addressAt(file, line, {
    beat,
  });
  return typeof address === "string" ? address : null;
};
