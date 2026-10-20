import type { ProgramChangeSummary } from "@impower/sparkdown/src/compiler/types/ProgramChangeSummary";
import type { RouteStep } from "@impower/sparkdown/src/compiler/utils/planRoute";
import type {
  ChunkPosition,
  ProgramRoot,
  SequenceRow,
} from "@impower/sparkdown/src/program/ProgramRoot";
import { SymbolKind } from "@impower/sparkdown/src/program/ProgramSymbols";
import { chunkOfAddress } from "@impower/sparkdown/src/program/ProgramChunk";

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
 * between two kept ones ends it where the new statement would run. A scene
 * with no content of its own enters its first branch by a binding no chunk
 * holds, so a step at the top of a branch also ends it when the branch's
 * scene starts elsewhere in the new root (a branch inserted above the first
 * one, or content written before it).
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
    const id = chunkOfAddress(steps[i]!.address);
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
    // A step at the top of a branch may have been reached through its
    // scene's start binding, which no chunk's code holds: a scene with no
    // content of its own enters its first branch. A route that reached the
    // branch that way holds only while the scene still starts there.
    if (
      place.was.entry === 0 &&
      sceneStart(before, place.was.sequence) !== sceneStart(after, place.now.sequence)
    ) {
      return i;
    }
    previous = id;
  }
  return steps.length;
};

/** For a branch's own sequence, the branch its scene enters when the scene
 *  is entered (`ProgramRoot.startOf`, which applies only while the scene has
 *  no content of its own), or -1 when it enters none; -2 for any other
 *  sequence. Symbols keep their ids from one root to the next of a
 *  generation, which a reseed ends (`ChunkChanges.initializers`). */
const sceneStart = (root: ProgramRoot, row: SequenceRow): number => {
  if (row.owner >= 0 || row.kind !== SymbolKind.Branch) {
    return -2;
  }
  const scene = root.parentOf(row.flow);
  const sceneRow = scene < 0 ? undefined : root.flow(scene);
  return sceneRow && sceneRow.arrays.chunks.length === 0
    ? root.startOf(scene)
    : -1;
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
