import type { StatementChunk } from "./StatementChunk";

/** One part of a statement that owns an anonymous symbol: the fingerprint of
 *  the part's own source, by which a re-emit aligns it (section 2), and its
 *  symbol, in the table generation the chunk was emitted in. */
export interface ChunkPart {
  readonly fingerprint: string;
  readonly symbol: number;
}

/** The parts of a statement that own anonymous symbols, each kind in the
 *  order the statement writes them: the functions it writes, its
 *  alternators and its choices (a named choice, which counts under its
 *  label, with symbol -1). */
export interface ChunkParts {
  readonly functions: readonly ChunkPart[];
  readonly alternators: readonly ChunkPart[];
  readonly choices: readonly ChunkPart[];
}

/** The kinds of parts, as a durable save names them. */
export type ChunkPartKind = keyof ChunkParts;

const parts = new WeakMap<StatementChunk, ChunkParts>();

/** Records the parts of a chunk as the chunk store emitted it
 *  (`ChunkStore`), which a durable save reads to name an anonymous symbol
 *  by its statement and part (docs/engine/binary-program.md, section 8). A
 *  chunk's ids belong to the table generation it was emitted in, so its
 *  parts are recorded once, as emitted. */
export const recordChunkParts = (
  chunk: StatementChunk,
  record: ChunkParts,
): void => {
  if (!parts.has(chunk)) {
    parts.set(chunk, {
      functions: record.functions.map(({ fingerprint, symbol }) => ({ fingerprint, symbol })),
      alternators: record.alternators.map(({ fingerprint, symbol }) => ({ fingerprint, symbol })),
      choices: record.choices.map(({ fingerprint, symbol }) => ({ fingerprint, symbol })),
    });
  }
};

/** The parts the chunk store recorded for a chunk, or nothing for a chunk
 *  it did not emit. */
export const chunkPartsOf = (chunk: StatementChunk): ChunkParts | undefined =>
  parts.get(chunk);
