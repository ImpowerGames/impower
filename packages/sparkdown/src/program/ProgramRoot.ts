import type { ProgramTable } from "../binary/ProgramBinaryWriter";
import type { Story } from "../inkjs/engine/Story";
import type { SymbolKindValue } from "./ProgramSymbols";
import { chunkId, type StatementChunk } from "./StatementChunk";

/**
 * The ordered chunks of one body and each entry's first line relative to the
 * body's first line (docs/engine/binary-program.md, section 1, The order
 * structure). The arrays are never edited: a compile that changes the body
 * builds new ones, and a root that does not change it shares them.
 */
export interface SequenceArrays {
  readonly chunks: readonly StatementChunk[];
  readonly lineStarts: readonly number[];
}

/** A root's row for one sequence. The build-out has reached flows, which own
 *  their sequence (no owner chunk and no block index). */
export interface SequenceRow {
  readonly id: number;
  readonly arrays: SequenceArrays;
  /** The flow's symbol. */
  readonly flow: number;
  /** What this root's program defines the flow as. The kind is the root's,
   *  like where the flow is defined: the table every root reads holds names
   *  only, and an edit, or a preview of one, can define a name as another
   *  kind while roots built before it are still in use. */
  readonly kind: SymbolKindValue;
  /** The owner's chunk id, or -1 for a flow's own sequence. */
  readonly owner: number;
  /** The block index in the owner's block table, or -1. */
  readonly block: number;
  /** The script the flow is written in. */
  readonly uri: string;
  /** The body's first line in its script, counting from 0. */
  readonly firstLine: number;
  /** The lines the body spans. */
  readonly span: number;
}

const PAGE_BITS = 10;
const PAGE_SIZE = 1 << PAGE_BITS;

/**
 * Chunk id to the id of the sequence that holds the chunk, or -1, in pages of
 * 1,024 ids. A compile copies the pages it writes and shares the others with
 * the previous root.
 */
export class ChunkTable {
  constructor(protected _pages: (Int32Array | undefined)[] = []) {}

  get(id: number): number {
    return this._pages[id >> PAGE_BITS]?.[id & (PAGE_SIZE - 1)] ?? -1;
  }

  /** A table that starts as this one and copies a page when `set` first
   *  writes it. */
  fork(): ChunkTableWriter {
    return new ChunkTableWriter(this._pages.slice());
  }
}

export class ChunkTableWriter {
  protected _owned = new Set<number>();

  constructor(protected _pages: (Int32Array | undefined)[]) {}

  set(id: number, sequence: number): void {
    const page = id >> PAGE_BITS;
    let words = this._pages[page];
    if (!this._owned.has(page)) {
      const copy = new Int32Array(PAGE_SIZE).fill(-1);
      if (words) {
        copy.set(words);
      }
      words = copy;
      this._pages[page] = words;
      this._owned.add(page);
    }
    words![id & (PAGE_SIZE - 1)] = sequence;
  }

  finish(): ChunkTable {
    return new ChunkTable(this._pages);
  }
}

/** Where a statement stands in a root: its sequence and its entry there. */
export interface ChunkPosition {
  sequence: SequenceRow;
  entry: number;
}

// The entry of each chunk in a sequence's arrays, built on first use. The
// arrays never change, so neither does the index.
const entryIndexes = new WeakMap<SequenceArrays, Map<number, number>>();

const entryIndex = (arrays: SequenceArrays): Map<number, number> => {
  let index = entryIndexes.get(arrays);
  if (!index) {
    index = new Map();
    arrays.chunks.forEach((chunk, entry) => index!.set(chunkId(chunk), entry));
    entryIndexes.set(arrays, index);
  }
  return index;
};

/**
 * One version of the whole program (docs/engine/binary-program.md, sections 1
 * and 9): what each sequence id holds, the flows by symbol, each script's
 * flows in the order of their first lines, and which sequence holds each
 * chunk. A compile produces a new root that shares every chunk and every array
 * it did not change; a preview compile's root is dropped afterwards, which
 * leaves the real one as it was.
 */
export class ProgramRoot {
  constructor(
    /** The `ProgramTable` the chunks' ids are interned in. */
    readonly table: ProgramTable,
    /** The root's identity, and its predecessor's (-1 for none). */
    readonly id: number,
    readonly since: number,
    protected _sequences: ReadonlyMap<number, SequenceRow>,
    protected _flows: ReadonlyMap<number, number>,
    protected _scriptFlows: ReadonlyMap<string, readonly number[]>,
    protected _chunks: ChunkTable,
    /** The table generation the chunks were minted in. */
    readonly generation: number,
    /** The current engine's story of the compile that built this root. Until
     *  the declaration sequence (#695) and functions (#698) are emitted as
     *  chunks, each engine built from the root runs its own copy of it
     *  (`Story.CopyWithOwnState`), which initializes the program's globals and
     *  runs the functions a host evaluates (see `ProgramStory`). */
    readonly runtimeStory: Story | null = null,
  ) {}

  /** The flow's sequence, or nothing when the program has no such flow. */
  flow(symbol: number): SequenceRow | undefined {
    const id = this._flows.get(symbol);
    return id === undefined ? undefined : this._sequences.get(id);
  }

  /** The flow named `name` (a qualified name; the top-level content's flow
   *  is named by the empty string). */
  flowNamed(name: string): SequenceRow | undefined {
    const symbol = this.table.symbolIds.get(name);
    return symbol === undefined ? undefined : this.flow(symbol);
  }

  /** This root's row for the sequence, or nothing for a body the program no
   *  longer has. */
  sequence(id: number): SequenceRow | undefined {
    return this._sequences.get(id);
  }

  /** Every sequence of the root. */
  sequences(): IterableIterator<SequenceRow> {
    return this._sequences.values();
  }

  /** Chunk id to the id of the sequence that holds the chunk. */
  get chunkIndex(): ChunkTable {
    return this._chunks;
  }

  /** Where a symbol is defined: its sequence, entry and offset. A flow is
   *  defined at the start of its sequence. */
  definition(
    symbol: number,
  ): { sequence: number; entry: number; offset: number } | undefined {
    const row = this.flow(symbol);
    return row ? { sequence: row.id, entry: 0, offset: 0 } : undefined;
  }

  /** The sequence that holds a chunk and the chunk's entry in it, searched
   *  for outward from `near` when one is given, or nothing when this root
   *  does not hold the chunk. */
  position(id: number, near?: number): ChunkPosition | undefined {
    const sequence = this._sequences.get(this._chunks.get(id));
    if (!sequence) {
      return undefined;
    }
    const chunks = sequence.arrays.chunks;
    if (near !== undefined) {
      for (let d = 0; d < chunks.length; d += 1) {
        for (const entry of [near + d, near - d]) {
          if (entry >= 0 && entry < chunks.length && chunkId(chunks[entry]!) === id) {
            return { sequence, entry };
          }
        }
      }
      return undefined;
    }
    const entry = entryIndex(sequence.arrays).get(id);
    return entry === undefined ? undefined : { sequence, entry };
  }

  /** A script's flows in the order of their first lines. */
  flows(uri: string): SequenceRow[] {
    const ids = this._scriptFlows.get(uri) ?? [];
    return ids.map((id) => this._sequences.get(id)!);
  }

  /** The statement a line of a script falls in: the last statement of the
   *  flow holding the line that starts at or above it. */
  statementAt(uri: string, line: number): ChunkPosition | undefined {
    let holder: SequenceRow | undefined;
    for (const flow of this.flows(uri)) {
      if (flow.firstLine <= line && line < flow.firstLine + flow.span) {
        holder = flow;
      }
    }
    if (!holder || holder.arrays.chunks.length === 0) {
      return undefined;
    }
    const starts = holder.arrays.lineStarts;
    const relative = line - holder.firstLine;
    let lo = 0;
    let hi = starts.length - 1;
    if (starts[0]! > relative) {
      return { sequence: holder, entry: 0 };
    }
    while (lo < hi) {
      const mid = (lo + hi + 1) >>> 1;
      if (starts[mid]! <= relative) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return { sequence: holder, entry: lo };
  }

  /** The script a sequence's flow is written in and the absolute first line
   *  (counting from 0) of the sequence's entry. */
  lineOf(sequence: SequenceRow, entry: number): number {
    return sequence.firstLine + (sequence.arrays.lineStarts[entry] ?? 0);
  }
}
