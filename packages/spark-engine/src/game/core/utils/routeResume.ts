import type { ProgramChangeSummary } from "@impower/sparkdown/src/compiler/types/ProgramChangeSummary";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import type { RouteStep } from "@impower/sparkdown/src/compiler/utils/planRoute";
import { pathLocation } from "@impower/sparkdown/src/compiler/utils/pathLocationTable";

/**
 * How much of a route planned in one program still describes the next one.
 *
 * The answer is a count of leading steps, because what a caller needs from it
 * is a prefix: a checkpoint records the whole story so far, so it may only be
 * resumed from while EVERYTHING before it is still what it was. One changed
 * statement anywhere earlier invalidates every checkpoint after it, however far
 * down the route they sit.
 *
 * A step survives two questions. First, does its path still point where it
 * pointed — an edit that lowers to more or fewer runtime objects renumbers the
 * index-addressed paths after it, so a path above the edit can come to name
 * different content, and a checkpoint records visit counts and a callstack by
 * path. Second, was the text it came from left alone: its recorded line has to
 * be above the first line its script changed at, because an edit that replaces
 * a word with another of the same length moves no path at all.
 *
 * Nothing is reusable unless the summary both claims to be confined and is
 * measured against the very program this route was replayed in. The second is
 * not a formality: a compile that produced no route of its own leaves the route
 * a program older than the one the next summary compares with, and the
 * positions in it would then be read against text they never described.
 */
export const validRoutePrefixLength = (
  steps: ReadonlyArray<RouteStep>,
  program: SparkProgram,
  changes: ProgramChangeSummary | undefined,
  routedChangeId: number | undefined,
): number => {
  if (!changes?.confined) {
    return 0;
  }
  if (routedChangeId == null || changes.since !== routedChangeId) {
    return 0;
  }
  const locations = program.pathLocations;
  const changedFrom = changes.changedFrom;
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i]!;
    if (!step.stamped) {
      // A step the replay never reached, so nothing is known about where it
      // pointed. Everything from here on is a guess.
      return i;
    }
    const was = step.location;
    const now = pathLocation(locations, step.path);
    if (was == null || now == null) {
      if (was !== now) {
        return i;
      }
      continue;
    }
    if (
      now[0] !== was[0] ||
      now[1] !== was[1] ||
      now[2] !== was[2] ||
      now[3] !== was[3] ||
      now[4] !== was[4]
    ) {
      return i;
    }
    const uri = step.uri;
    if (uri != null) {
      const from = changedFrom[uri];
      if (from != null && was[1] >= from) {
        return i;
      }
    }
  }
  return steps.length;
};
