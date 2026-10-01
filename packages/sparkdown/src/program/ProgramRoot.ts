import type { ProgramTable } from "../binary/ProgramBinaryWriter";
import type { Story } from "../inkjs/engine/Story";
import type { SymbolKindValue } from "./ProgramSymbols";
import {
  B_HEAD_LINES,
  B_SEQUENCE,
  blockCount,
  blockField,
  chunkId,
  type StatementChunk,
} from "./StatementChunk";

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

/** A root's row for one sequence: a flow's own, a block's body, or a
 *  script's declaration sequence. */
export interface SequenceRow {
  readonly id: number;
  readonly arrays: SequenceArrays;
  /** The flow's symbol, or -1 for a declaration sequence. */
  readonly flow: number;
  /** What this root's program defines the flow as. The kind is the root's,
   *  like where the flow is defined: the table every root reads holds names
   *  only, and an edit, or a preview of one, can define a name as another
   *  kind while roots built before it are still in use. */
  readonly kind: SymbolKindValue;
  /** The owner's chunk id, or -1 for a flow's own sequence and a
   *  declaration sequence. */
  readonly owner: number;
  /** The block index in the owner's block table, or -1. */
  readonly block: number;
  /** The script the sequence is written in. */
  readonly uri: string;
  /** The body's first line in its script, counting from 0. A body's is
   *  derived from its owner's line and block rows and the spans of the
   *  bodies above it, and this root keeps it as it derived it. */
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

/** Where a symbol a chunk exports is defined: the chunk's id and the offset
 *  of the code that defines it. The chunk's entry in its sequence is found
 *  through the chunk table, so an insertion that shifts the entry changes no
 *  definition. */
export interface SymbolDefinition {
  chunk: number;
  offset: number;
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
 * flows in the order of their first lines and its declaration sequence, the
 * order the declarations initialize the globals in, and which sequence holds
 * each chunk. A compile produces a new root that shares every chunk and every
 * array it did not change; a preview compile's root is dropped afterwards,
 * which leaves the real one as it was.
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
    /** The current engine's story of the compile that built this root. Each
     *  engine built from the root runs its own copy of it
     *  (`Story.CopyWithOwnState`), whose globals and call stack hold the
     *  engine's variables (see `ProgramStory`). */
    readonly runtimeStory: Story | null = null,
    protected _declarations: ReadonlyMap<string, number> = new Map(),
    /** The declaration chunks in the order `ResetState` runs them, which is
     *  the order the current engine's `global decl` container initializes
     *  the globals in: constants first, then the others as the story
     *  declares them. */
    readonly initialization: readonly StatementChunk[] = [],
    /** Where each symbol the chunks export is defined: every function. */
    protected _definitions: ReadonlyMap<number, SymbolDefinition> = new Map(),
    /** The name each function is shown by in a stack trace or a printed
     *  value: a function declared at the top level its qualified name, and
     *  one a statement writes the name the current engine gives its
     *  container. */
    protected _labels: ReadonlyMap<number, string> = new Map(),
    /** The symbol remap of each reseed of the table, by the generation it
     *  maps from (`ChunkStore.reseed`). */
    protected _symbolRemaps: readonly Int32Array[] = [],
  ) {}

  /** The id in this root's table generation of symbol `symbol` of table
   *  generation `generation`, taken through the remap of each reseed between
   *  them, or nothing when a reseed dropped it (docs/engine/binary-program.md,
   *  section 2, Reseed). */
  symbolFrom(symbol: number, generation: number): number | undefined {
    if (generation > this.generation) {
      return undefined;
    }
    let id = symbol;
    for (let g = generation; g < this.generation; g += 1) {
      const remap = this._symbolRemaps[g];
      id = remap && id < remap.length ? remap[id]! : -1;
      if (id < 0) {
        return undefined;
      }
    }
    return id;
  }

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

  /** A script's declaration sequence, or nothing when it declares no
   *  global. */
  declarations(uri: string): SequenceRow | undefined {
    const id = this._declarations.get(uri);
    return id === undefined ? undefined : this._sequences.get(id);
  }

  /** The flows' sequences in the order the program runs them. */
  flowSequences(): SequenceRow[] {
    return [...this._flows.values()].map((id) => this._sequences.get(id)!);
  }

  /** The row of block `block` of the chunk `owner`'s body. */
  body(owner: StatementChunk, block: number): SequenceRow | undefined {
    return this._sequences.get(blockField(owner, block, B_SEQUENCE));
  }

  /** Every statement chunk of the flows, flow after flow, each block
   *  statement before the statements of its bodies, then the statements of
   *  the functions the declarations write, in the order the declarations
   *  run, which is the order a compile aligns the next program's statements
   *  with. */
  statementOrder(): StatementChunk[] {
    const out: StatementChunk[] = [];
    const walk = (row: SequenceRow | undefined) => {
      for (const chunk of row?.arrays.chunks ?? []) {
        out.push(chunk);
        walkBodies(chunk);
      }
    };
    const walkBodies = (chunk: StatementChunk) => {
      for (let k = 0; k < blockCount(chunk); k += 1) {
        walk(this.body(chunk, k));
      }
    };
    for (const row of this.flowSequences()) {
      walk(row);
    }
    this.initialization.forEach(walkBodies);
    return out;
  }

  /** Chunk id to the id of the sequence that holds the chunk. */
  get chunkIndex(): ChunkTable {
    return this._chunks;
  }

  /** Where a symbol is defined: its sequence, entry and offset. A function
   *  is defined where a chunk exports it, and another flow at the start of
   *  its sequence. */
  definition(
    symbol: number,
  ): { sequence: number; entry: number; offset: number } | undefined {
    const exported = this._definitions.get(symbol);
    if (exported) {
      const at = this.position(exported.chunk);
      return at
        ? { sequence: at.sequence.id, entry: at.entry, offset: exported.offset }
        : undefined;
    }
    const row = this.flow(symbol);
    return row ? { sequence: row.id, entry: 0, offset: 0 } : undefined;
  }

  /** Where the code of the function `symbol` names starts, or nothing when
   *  the program defines no such function. */
  functionEntry(
    symbol: number,
  ): { sequence: SequenceRow; entry: number; offset: number } | undefined {
    const exported = this._definitions.get(symbol);
    const at = exported ? this.position(exported.chunk) : undefined;
    return at && exported
      ? { sequence: at.sequence, entry: at.entry, offset: exported.offset }
      : undefined;
  }

  /** The name a symbol is shown by: a function's, as `_labels` holds it, or
   *  the qualified name the table holds. */
  labelOf(symbol: number): string {
    return this._labels.get(symbol) ?? this.table.symbols[symbol] ?? "";
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

  /** The owner of a body's sequence: the sequence that holds the owner's
   *  chunk and its entry there, or nothing for a flow's own sequence. */
  ownerOf(sequence: SequenceRow): ChunkPosition | undefined {
    return sequence.owner < 0 ? undefined : this.position(sequence.owner);
  }

  /** A script's flows in the order of their first lines. */
  flows(uri: string): SequenceRow[] {
    const ids = this._scriptFlows.get(uri) ?? [];
    return ids.map((id) => this._sequences.get(id)!);
  }

  /** The statement a line of a script falls in: the last statement of the
   *  flow holding the line that starts at or above it, and when the line
   *  falls inside one of that statement's bodies, the statement of the body
   *  it falls in, and so on inward. */
  statementAt(uri: string, line: number): ChunkPosition | undefined {
    let holder: SequenceRow | undefined;
    for (const flow of this.flows(uri)) {
      if (flow.firstLine <= line && line < flow.firstLine + flow.span) {
        holder = flow;
      }
    }
    let at = holder ? this.entryAt(holder, line) : undefined;
    while (at) {
      const chunk = at.sequence.arrays.chunks[at.entry]!;
      let inner: ChunkPosition | undefined;
      for (let k = 0; k < blockCount(chunk); k += 1) {
        const body = this.body(chunk, k);
        if (body && body.firstLine <= line && line < body.firstLine + body.span) {
          inner = this.entryAt(body, line);
          break;
        }
      }
      if (!inner) {
        return at;
      }
      at = inner;
    }
    return undefined;
  }

  /** The last entry of `sequence` that starts at or above `line`, or its
   *  first when every entry starts below it. */
  protected entryAt(sequence: SequenceRow, line: number): ChunkPosition | undefined {
    const starts = sequence.arrays.lineStarts;
    if (starts.length === 0) {
      return undefined;
    }
    const relative = line - sequence.firstLine;
    if (starts[0]! > relative) {
      return { sequence, entry: 0 };
    }
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >>> 1;
      if (starts[mid]! <= relative) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return { sequence, entry: lo };
  }

  /** The absolute first line (counting from 0) of a sequence's entry. */
  lineOf(sequence: SequenceRow, entry: number): number {
    return sequence.firstLine + (sequence.arrays.lineStarts[entry] ?? 0);
  }

  /** The first line of the end of block `block` of the statement at `entry`
   *  of `sequence`: the line after the last line of that block's body. */
  blockEndLine(sequence: SequenceRow, entry: number, block: number): number {
    const chunk = sequence.arrays.chunks[entry]!;
    const body = this.body(chunk, block);
    if (body) {
      return body.firstLine + body.span;
    }
    // A body this root does not hold: its lines follow from the block rows.
    let line = this.lineOf(sequence, entry);
    for (let k = 0; k <= block; k += 1) {
      line += blockField(chunk, k, B_HEAD_LINES);
      line += this.body(chunk, k)?.span ?? 0;
    }
    return line;
  }
}
