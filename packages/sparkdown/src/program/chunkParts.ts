import type { ProgramChunk } from "./ProgramChunk";

/** One part of a statement: the fingerprint of the part's own source, by
 *  which a re-emit aligns it (section 2), its anonymous symbol, in the table
 *  generation the chunk was emitted in (-1 for a part that owns none), and
 *  the block of the chunk whose body it heads (-1 for a part that heads no
 *  body). */
export interface ChunkPart {
  readonly fingerprint: string;
  readonly symbol: number;
  readonly block: number;
}

/** The parts of a statement, each kind in the order the statement writes
 *  them: the functions it writes, its alternators, its choices (a named
 *  choice, which counts under its label, with symbol -1), and the parts that
 *  head its other bodies (a branch's condition or its `else`, a loop's
 *  header, a `do`, a `then` clause). A body's part is the one a re-emit
 *  aligns it by, so a durable save names a body by its part in the owner's
 *  listing of that kind (docs/engine/binary-program.md, section 8). */
export interface ChunkParts {
  readonly functions: readonly ChunkPart[];
  readonly alternators: readonly ChunkPart[];
  readonly choices: readonly ChunkPart[];
  readonly heads: readonly ChunkPart[];
}

/** The kinds of parts, as a durable save names them. */
export type ChunkPartKind = keyof ChunkParts;

const CHUNK_PART_KINDS: readonly ChunkPartKind[] = [
  "functions",
  "alternators",
  "choices",
  "heads",
];

const parts = new WeakMap<ProgramChunk, ChunkParts>();

const copyParts = (list: readonly Partial<ChunkPart>[] | undefined): ChunkPart[] =>
  (list ?? []).map(({ fingerprint, symbol, block }) => ({
    fingerprint: fingerprint ?? "",
    symbol: symbol ?? -1,
    block: block ?? -1,
  }));

/** Records the parts of a chunk as the chunk store emitted it
 *  (`ChunkStore`), which a durable save reads to name an anonymous symbol
 *  by its statement and part, and a body by the part that heads it
 *  (docs/engine/binary-program.md, section 8). A chunk's ids belong to the
 *  table generation it was emitted in, so its parts are recorded once, as
 *  emitted. */
export const recordChunkParts = (
  chunk: ProgramChunk,
  record: {
    functions: readonly Partial<ChunkPart>[];
    alternators: readonly Partial<ChunkPart>[];
    choices: readonly Partial<ChunkPart>[];
    heads?: readonly Partial<ChunkPart>[];
  },
): void => {
  if (!parts.has(chunk)) {
    parts.set(chunk, {
      functions: copyParts(record.functions),
      alternators: copyParts(record.alternators),
      choices: copyParts(record.choices),
      heads: copyParts(record.heads),
    });
  }
};

/** The parts the chunk store recorded for a chunk, or nothing for a chunk
 *  it did not emit. */
export const chunkPartsOf = (chunk: ProgramChunk): ChunkParts | undefined =>
  parts.get(chunk);

/** The part of `chunk` that heads its block `block`: its kind and its
 *  ordinal among the chunk's parts of that kind, or nothing. */
export const partOfBlock = (
  chunk: ProgramChunk,
  block: number,
): { kind: ChunkPartKind; index: number } | undefined => {
  const recorded = parts.get(chunk);
  if (!recorded) {
    return undefined;
  }
  for (const kind of CHUNK_PART_KINDS) {
    const index = recorded[kind].findIndex((part) => part.block === block);
    if (index >= 0) {
      return { kind, index };
    }
  }
  return undefined;
};

/** How a part was paired with an old one (`alignParts`): equal and in
 *  order, equal wherever it stands, or between two matched parts. */
export type HandedOn = "aligned" | "aligned-moved" | "between" | "new";

/**
 * Aligns the new parts of a statement with the old ones, by their
 * fingerprints, as section 2 aligns a re-emitted statement's parts: parts
 * whose fingerprints are equal and that stand in the same order are matched
 * first, the nearest in order where several read the same; then a part left
 * whose fingerprint equals one left on the other side, wherever it stands;
 * then, in each run of parts left between two matched ones, the old are
 * paired with the new in order. Returns, per new part, the index of its old
 * part, or nothing, and the pass that paired it. It is the one alignment of
 * every part of a statement emitted again in place (its functions, its
 * alternators, its choices and the parts that head its other bodies), and
 * the one a durable save's part listing is placed by (section 8).
 */
export const alignParts = (
  now: readonly string[],
  was: readonly string[],
): { pairs: (number | undefined)[]; how: (HandedOn | undefined)[] } => {
  const pairs: (number | undefined)[] = now.map(() => undefined);
  const how: (HandedOn | undefined)[] = now.map(() => undefined);
  const taken = new Set<number>();
  // Equal and in order.
  let from = 0;
  now.forEach((fingerprint, i) => {
    for (let o = from; o < was.length; o += 1) {
      if (was[o] === fingerprint) {
        pairs[i] = o;
        how[i] = "aligned";
        taken.add(o);
        from = o + 1;
        return;
      }
    }
  });
  // Equal, wherever they stand.
  now.forEach((fingerprint, i) => {
    if (pairs[i] !== undefined) {
      return;
    }
    const o = was.findIndex((w, k) => w === fingerprint && !taken.has(k));
    if (o >= 0) {
      pairs[i] = o;
      how[i] = "aligned-moved";
      taken.add(o);
    }
  });
  // The rest, in order, between matched parts.
  let lastOld = -1;
  for (let i = 0; i < now.length; i += 1) {
    if (pairs[i] !== undefined) {
      lastOld = Math.max(lastOld, pairs[i]!);
      continue;
    }
    for (let o = lastOld + 1; o < was.length; o += 1) {
      if (taken.has(o)) {
        break;
      }
      pairs[i] = o;
      how[i] = "between";
      taken.add(o);
      lastOld = o;
      break;
    }
  }
  return { pairs, how };
};
