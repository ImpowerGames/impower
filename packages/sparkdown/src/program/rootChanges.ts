import type { ChunkChanges } from "../compiler/types/ProgramChangeSummary";
import { functionChunksOf, type BuildRecord } from "./ChunkStore";
import type { ProgramRoot } from "./ProgramRoot";
import {
  chunkId,
  exportCount,
  exportSymbol,
  type StatementChunk,
} from "./StatementChunk";

const ascending = (a: number, b: number) => a - b;

/** Where a root defines a symbol: the chunk, the offset and the sequence. */
const definitionKey = (root: ProgramRoot, symbol: number): string => {
  const at = root.place(symbol);
  if (!at) {
    return "";
  }
  const chunk = at.sequence.arrays.chunks[at.entry];
  return `${at.sequence.id}:${chunk ? chunkId(chunk) : -1}:${at.offset}`;
};

/** Whether two roots run the declarations in the same order. */
const sameInitialization = (before: ProgramRoot, after: ProgramRoot) =>
  before.initialization.length === after.initialization.length &&
  before.initialization.every((chunk, i) => chunk === after.initialization[i]);

/**
 * What a compile changed in the program's statement chunks, from the root it
 * built and the root it is measured against (`ProgramChangeSummary.chunks`).
 * Chunk ids never go back, so a chunk held by both roots is one statement
 * whose code neither compile changed, and every other is one the compile
 * emitted or dropped. The ids are in ascending order.
 *
 * When `build` is the store's record of the build that made `after` from
 * `before` (`ChunkStore.lastBuild`), the changes are read from it in work
 * proportional to the edit; otherwise (a first compile, a compile measured
 * against a preview's root, a preview measured against an older root) the two
 * whole roots are compared. Both give the same result.
 */
export const rootChanges = (
  before: ProgramRoot | undefined,
  after: ProgramRoot,
  build?: BuildRecord,
): ChunkChanges => {
  // A compile that served the root it measured against (a cached compile)
  // changed nothing.
  if (before === after) {
    return { dropped: [], emitted: [], moved: [], initializers: false };
  }
  if (
    before &&
    build &&
    build.previous === before &&
    build.root === after &&
    before.generation === after.generation
  ) {
    return buildChanges(build, before, after);
  }
  return wholeRootChanges(before, after);
};

/** The changes read from the store's record of the build that made `after`
 *  from `before`: the chunks it dropped, those it placed that `before` does
 *  not hold, and the symbols that a dropped or placed chunk exports or that
 *  name the flow of a sequence it built again or removed, which are the only
 *  definitions a build writes (`ChunkStore.definitionArrays`). */
const buildChanges = (
  build: BuildRecord,
  before: ProgramRoot,
  after: ProgramRoot,
): ChunkChanges => {
  const symbols = new Set<number>();
  const exports = (chunk: StatementChunk) => {
    for (let row = 0; row < exportCount(chunk); row += 1) {
      symbols.add(exportSymbol(chunk, row));
    }
  };
  const dropped: number[] = [];
  for (const chunk of build.dropped) {
    dropped.push(chunkId(chunk));
    exports(chunk);
  }
  const emitted: number[] = [];
  for (const chunk of build.placed) {
    if (before.chunkIndex.get(chunkId(chunk)) < 0) {
      emitted.push(chunkId(chunk));
    }
    exports(chunk);
  }
  for (const id of build.sequences) {
    for (const root of [before, after]) {
      const row = root.sequence(id);
      if (row && row.owner < 0 && row.flow >= 0) {
        symbols.add(row.flow);
      }
    }
  }
  const moved: number[] = [];
  for (const symbol of symbols) {
    if (definitionKey(before, symbol) !== definitionKey(after, symbol)) {
      moved.push(symbol);
    }
  }
  return {
    dropped: dropped.sort(ascending),
    emitted: emitted.sort(ascending),
    moved: moved.sort(ascending),
    initializers: build.declarationsChanged,
  };
};

/** Every chunk a root holds, with its id. */
const chunksOf = (root: ProgramRoot): Map<number, StatementChunk> => {
  const out = new Map<number, StatementChunk>();
  for (const row of root.sequences()) {
    for (const chunk of row.arrays.chunks) {
      out.set(chunkId(chunk), chunk);
    }
  }
  return out;
};

/** The changes found by comparing the two whole roots. The declarations ran
 *  again (`initializers`) when the declaration chunks or their order differ,
 *  or a chunk holds a function's code in one root and not the other
 *  (`functionChunksOf`), which is the store's rule for a build
 *  (`ProgramBuild.declarationsChanged`). */
const wholeRootChanges = (
  before: ProgramRoot | undefined,
  after: ProgramRoot,
): ChunkChanges => {
  const old = before ? chunksOf(before) : new Map<number, StatementChunk>();
  const now = chunksOf(after);
  const dropped: number[] = [];
  const emitted: number[] = [];
  for (const id of old.keys()) {
    if (!now.has(id)) {
      dropped.push(id);
    }
  }
  for (const id of now.keys()) {
    if (!old.has(id)) {
      emitted.push(id);
    }
  }
  let initializers = !before || !sameInitialization(before, after);
  if (!initializers) {
    const was = functionChunksOf(before!);
    const is = functionChunksOf(after);
    initializers =
      was.size !== is.size || [...is].some((chunk) => !was.has(chunk));
  }
  const moved: number[] = [];
  if (before && before.generation === after.generation) {
    const symbols = Math.max(
      before.table.symbols.length,
      after.table.symbols.length,
    );
    for (let symbol = 0; symbol < symbols; symbol += 1) {
      if (definitionKey(before, symbol) !== definitionKey(after, symbol)) {
        moved.push(symbol);
      }
    }
  } else if (before) {
    // A reseed renumbered every symbol, and the compile emitted every chunk
    // again: nothing measured against the older root holds.
    initializers = true;
  }
  return {
    dropped: dropped.sort(ascending),
    emitted: emitted.sort(ascending),
    moved,
    initializers,
  };
};
