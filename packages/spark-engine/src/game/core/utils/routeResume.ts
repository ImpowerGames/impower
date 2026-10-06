import type { ProgramChangeSummary } from "@impower/sparkdown/src/compiler/types/ProgramChangeSummary";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import type { RouteStep } from "@impower/sparkdown/src/compiler/utils/planRoute";
import { pathLocation } from "@impower/sparkdown/src/compiler/utils/pathLocationTable";
import type {
  ChunkPosition,
  ProgramRoot,
} from "@impower/sparkdown/src/program/ProgramRoot";
import { chunkOfAddress } from "@impower/sparkdown/src/program/StatementChunk";

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
    const now =
      typeof step.address === "string"
        ? pathLocation(locations, step.address)
        : undefined;
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

/**
 * How much of a route planned on the program engine still describes the next
 * program (docs/engine/binary-program.md, section 8): the steps, from the
 * first, whose statements the compile kept, up to where the new program
 * would run a statement the old one did not.
 *
 * A step is known by its address, which names its statement's chunk, and a
 * chunk id is never given again: a step whose chunk the new root still holds
 * ran the same code. Where the code does not say where the story goes next,
 * the order of the statements does, and an edit can change that order around
 * statements that keep their chunks; so each move of the route from one chunk
 * to another must still be one the new root makes: from a statement to the
 * one after it in its sequence, into a sequence at its first entry (a body
 * entered, a flow jumped to), and out of a sequence from its last entry (a
 * body that ran out). The first step whose chunk is gone, or that the new
 * program would reach some other way, ends the prefix: a statement inserted
 * between two kept ones ends it where the new statement would run.
 *
 * A step proves its statement's code and not the state it ran on, so a
 * compile that emitted again or dropped a declaration chunk or a function
 * chunk, or reordered the declarations (`ChunkChanges.initializers`, the rule
 * of #695), keeps no step: every checkpoint holds the values the old
 * initializers computed, and the route replays from the top with the new
 * initial state. So does a compile measured against another program than the
 * one the route was replayed in, or one that says nothing of its chunks.
 */
export const validAddressPrefixLength = (
  steps: ReadonlyArray<RouteStep>,
  before: ProgramRoot | undefined,
  after: ProgramRoot,
  changes: ProgramChangeSummary | undefined,
  routedChangeId: number | undefined,
): number => {
  const chunks = changes?.chunks;
  if (!chunks || !before || chunks.initializers) {
    return 0;
  }
  if (routedChangeId == null || changes.since !== routedChangeId) {
    return 0;
  }
  // Where a chunk stands in each root, found once per chunk.
  const places = new Map<
    number,
    { was: ChunkPosition | undefined; now: ChunkPosition | undefined }
  >();
  const placeOf = (id: number) => {
    let place = places.get(id);
    if (!place) {
      place = { was: before.position(id), now: after.position(id) };
      places.set(id, place);
    }
    return place;
  };
  let previous = -1;
  for (let i = 0; i < steps.length; i += 1) {
    const address = steps[i]!.address;
    if (typeof address !== "number") {
      return i;
    }
    const id = chunkOfAddress(address);
    if (id === previous) {
      continue;
    }
    const place = placeOf(id);
    if (!place.was || !place.now) {
      return i;
    }
    if (previous < 0) {
      // The route's first step: the top of the flow it starts at, in both.
      if ((place.was.entry === 0) !== (place.now.entry === 0)) {
        return i;
      }
    } else {
      const from = placeOf(previous);
      if (!from.was || !from.now || !sameMove(from.was, place.was, from.now, place.now)) {
        return i;
      }
    }
    previous = id;
  }
  return steps.length;
};

/** Whether a move of the route from one chunk to another in the root it ran
 *  in (`a` to `b`) is one the new root makes too (`a2` to `b2`). */
const sameMove = (
  a: ChunkPosition,
  b: ChunkPosition,
  a2: ChunkPosition,
  b2: ChunkPosition,
): boolean => {
  const next =
    a.sequence.id === b.sequence.id && b.entry === a.entry + 1;
  const next2 =
    a2.sequence.id === b2.sequence.id && b2.entry === a2.entry + 1;
  if (next !== next2) {
    return false;
  }
  if ((b.entry === 0) !== (b2.entry === 0)) {
    return false;
  }
  const last = a.entry === a.sequence.arrays.chunks.length - 1;
  const last2 = a2.entry === a2.sequence.arrays.chunks.length - 1;
  if (!next && a.sequence.id !== b.sequence.id && last !== last2) {
    return false;
  }
  return true;
};
