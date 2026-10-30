import type { ChunkChanges } from "../compiler/types/ProgramChangeSummary";
import { functionChunksOf, type BuildRecord } from "./ChunkStore";
import type { ProgramRoot } from "./ProgramRoot";
import {
  chunkId,
  exportCount,
  exportSymbol,
  type ProgramChunk,
} from "./ProgramChunk";

const ascending = (a: number, b: number) => a - b;

const definitionKey = (root: ProgramRoot, symbol: number): string => {
  const at = root.place(symbol);
  if (!at) {
    return "";
  }
  const chunk = at.sequence.arrays.chunks[at.entry];
  return `${at.sequence.id}:${chunk ? chunkId(chunk) : -1}:${at.offset}`;
};

const sameInitialization = (before: ProgramRoot, after: ProgramRoot) =>
  before.initialization.length === after.initialization.length &&
  before.initialization.every((chunk, i) => chunk === after.initialization[i]);

export const rootChanges = (
  before: ProgramRoot | undefined,
  after: ProgramRoot,
  build?: BuildRecord,
): ChunkChanges => {
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

const buildChanges = (
  build: BuildRecord,
  before: ProgramRoot,
  after: ProgramRoot,
): ChunkChanges => {
  const symbols = new Set<number>();
  const exports = (chunk: ProgramChunk) => {
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

const chunksOf = (root: ProgramRoot): Map<number, ProgramChunk> => {
  const out = new Map<number, ProgramChunk>();
  for (const row of root.sequences()) {
    for (const chunk of row.arrays.chunks) {
      out.set(chunkId(chunk), chunk);
    }
  }
  return out;
};

const wholeRootChanges = (
  before: ProgramRoot | undefined,
  after: ProgramRoot,
): ChunkChanges => {
  const old = before ? chunksOf(before) : new Map<number, ProgramChunk>();
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
    initializers = true;
  }
  return {
    dropped: dropped.sort(ascending),
    emitted: emitted.sort(ascending),
    moved,
    initializers,
  };
};
