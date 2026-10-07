import type { ChunkChanges } from "../compiler/types/ProgramChangeSummary";
import type { ProgramRoot } from "./ProgramRoot";
import { SymbolKind } from "./ProgramSymbols";
import {
  BLOCK_FUNCTION,
  blockFlags,
  chunkId,
  exportCount,
  exportSymbol,
  type StatementChunk,
} from "./StatementChunk";

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

/**
 * Whether a chunk of `root` holds code the declarations run or may call
 * (docs/engine/binary-program.md, section 1, the rule of #695): a chunk of a
 * script's declaration sequence or of a declaration's bodies, a chunk of a
 * function declared at the top level, a chunk that writes a function, and a
 * chunk inside a function's body.
 */
export const isInitializerChunk = (
  root: ProgramRoot,
  chunk: StatementChunk,
): boolean => {
  for (let row = 0; row < exportCount(chunk); row += 1) {
    if (root.kindOf(exportSymbol(chunk, row)) === SymbolKind.Function) {
      return true;
    }
  }
  let sequence = root.position(chunkId(chunk))?.sequence;
  while (sequence) {
    if (sequence.owner < 0) {
      return sequence.flow < 0 || sequence.kind === SymbolKind.Function;
    }
    const owner = root.position(sequence.owner);
    if (!owner) {
      return false;
    }
    const ownerChunk = owner.sequence.arrays.chunks[owner.entry]!;
    if (blockFlags(ownerChunk, sequence.block) & BLOCK_FUNCTION) {
      return true;
    }
    sequence = owner.sequence;
  }
  return false;
};

/** Where a root defines a symbol: the chunk, the offset and the sequence. */
const definitionKey = (root: ProgramRoot, symbol: number): string => {
  const at = root.place(symbol);
  if (!at) {
    return "";
  }
  const chunk = at.sequence.arrays.chunks[at.entry];
  return `${at.sequence.id}:${chunk ? chunkId(chunk) : -1}:${at.offset}`;
};

/**
 * What a compile changed in the program's statement chunks, from the root it
 * built and the root it is measured against (`ProgramChangeSummary.chunks`).
 * Chunk ids never go back, so a chunk held by both roots is one statement
 * whose code neither compile changed, and every other is one the compile
 * emitted or dropped.
 */
export const rootChanges = (
  before: ProgramRoot | undefined,
  after: ProgramRoot,
): ChunkChanges => {
  // A compile that served the root it measured against (a cached compile)
  // changed nothing.
  if (before === after) {
    return { dropped: [], emitted: [], moved: [], initializers: false };
  }
  const old = before ? chunksOf(before) : new Map<number, StatementChunk>();
  const now = chunksOf(after);
  const dropped: number[] = [];
  const emitted: number[] = [];
  let initializers = !before;
  for (const [id, chunk] of old) {
    if (!now.has(id)) {
      dropped.push(id);
      initializers ||= isInitializerChunk(before!, chunk);
    }
  }
  for (const [id, chunk] of now) {
    if (!old.has(id)) {
      emitted.push(id);
      initializers ||= isInitializerChunk(after, chunk);
    }
  }
  const order = before?.initialization ?? [];
  if (
    order.length !== after.initialization.length ||
    order.some((chunk, i) => chunk !== after.initialization[i])
  ) {
    initializers = true;
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
  return { dropped, emitted, moved, initializers };
};
