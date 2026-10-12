import type { ProgramTable } from "./ProgramTable";
import type {
  AddressQuery,
  SourceLocation,
} from "../compiler/types/ProgramAddress";
import type { ListDefinitionsOrigin } from "../runtime/ListDefinitionsOrigin";
import type { StructDefinitionTable } from "../runtime/StructDefinition";
import {
  SymbolKind,
  UNDEFINED_KIND,
  type SymbolKindValue,
} from "./ProgramSymbols";
import { Op, opOf } from "./ProgramInstructions";
import {
  ANCHOR_STATEMENT,
  BLOCK_FUNCTION,
  B_HEAD_LINES,
  B_SEQUENCE,
  HEADER_WORDS,
  H_LINE_ROWS,
  LINE_ROW_WORDS,
  addressOf,
  blockCount,
  blockField,
  blockFlags,
  chunkId,
  chunkOfAddress,
  codeWords,
  lineRowAt,
  lineTableStart,
  offsetOfAddress,
  type ProgramChunk,
} from "./ProgramChunk";

/**
 * The ordered chunks of one body and each entry's first line relative to the
 * body's first line (docs/engine/binary-program.md, section 1, The order
 * structure). The arrays are never edited: a compile that changes the body
 * builds new ones, and a root that does not change it shares them.
 */
export interface SequenceArrays {
  readonly chunks: readonly ProgramChunk[];
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
  /** For a flow's own sequence and a declaration sequence, which have no
   *  owner, the first line of the body in its script, counting from 0; -1
   *  for a block's body. Where a body starts is the root's to derive
   *  (`ProgramRoot.firstLineOf`): its owner's line, the lines of the owner's
   *  parts above it and the spans of the bodies above it. So a body's row
   *  holds nothing that an edit above its owner moves, and a root built
   *  after such an edit shares it (docs/engine/binary-program.md, section
   *  1, The order structure). */
  readonly firstLine: number;
  /** The lines the body spans. */
  readonly span: number;
}

/** A source range as a line table row gives it, with lines and columns
 *  counting from 0 in the statement's script. */
export interface SourceRange {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
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

/**
 * A root's definition arrays (docs/engine/binary-program.md, section 2,
 * Resolution), indexed by symbol id, each the length of the table's symbols
 * when the root was built; a symbol interned later is one the root does not
 * define. A symbol a chunk exports (a function, a label) is defined at the
 * chunk's id and the offset of the code that defines it, and the chunk's
 * entry in its sequence is found through the chunk table, so an insertion
 * that shifts the entry changes no definition row; a flow is defined at the
 * start of its sequence.
 */
export interface DefinitionArrays {
  /** The id of the chunk that exports the symbol, or -1. */
  chunk: Int32Array;
  /** The offset in that chunk's code. */
  offset: Int32Array;
  /** For a flow, the id of its sequence; -1 otherwise. */
  sequence: Int32Array;
  /** What the program defines the symbol as (`SymbolKind`), or
   *  `UNDEFINED_KIND`. */
  kind: Int8Array;
  /** For a branch, its scene's symbol; -1 otherwise. */
  parent: Int32Array;
  /** For a scene whose content starts with a branch, which it enters when
   *  it is entered, as the object engine's knot diverted to its first stitch,
   *  that branch's symbol; -1 otherwise. */
  start: Int32Array;
}

export const emptyDefinitions = (size = 0): DefinitionArrays => ({
  chunk: new Int32Array(size).fill(-1),
  offset: new Int32Array(size).fill(-1),
  sequence: new Int32Array(size).fill(-1),
  kind: new Int8Array(size).fill(UNDEFINED_KIND),
  parent: new Int32Array(size).fill(-1),
  start: new Int32Array(size).fill(-1),
});

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

/** Whether a sequence's arrays hold `chunk`. */
export const holdsChunk = (
  arrays: SequenceArrays,
  chunk: ProgramChunk,
): boolean => {
  const entry = entryIndex(arrays).get(chunkId(chunk));
  return entry !== undefined && arrays.chunks[entry] === chunk;
};

/** Whether `root` holds `chunk`, in the sequence its chunk table names. */
export const holdsChunkIn = (
  root: ProgramRoot,
  chunk: ProgramChunk,
): boolean => {
  const at = root.position(chunkId(chunk));
  return !!at && at.sequence.arrays.chunks[at.entry] === chunk;
};

/** What the engine of a root reads of the story besides its chunks, which
 *  the program path's resolver records (`ProgramResolver.resolve`): the
 *  story's list definitions, its struct definitions by type and name, and
 *  the names of the constants it registered, which the engine keeps
 *  read-only and out of its saves. */
export interface ProgramStoryTables {
  readonly listDefinitions: ListDefinitionsOrigin | null;
  readonly structDefinitions: StructDefinitionTable;
  readonly constantNames: ReadonlySet<string>;
}

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
    /** The `ProgramTable` the chunks' ids are interned in, as the generation
     *  the root was built in holds it: a reseed installs new arrays on the
     *  compiler's table and leaves these as they were, so a root still in use
     *  reads the strings, numbers and symbols its chunks were minted with
     *  (`snapshotTable`). */
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
    /** What an engine built from the root reads of the story besides its
     *  chunks: its lists, its structs and the names of its constants
     *  (`ProgramStoryTables`), from the compile that built the root. */
    readonly tables: ProgramStoryTables | null = null,
    protected _declarations: ReadonlyMap<string, number> = new Map(),
    /** The declaration chunks in the order `ResetState` runs them, which is
     *  the order the object engine's `global decl` container initialized
     *  the globals in: constants first, then the others as the story
     *  declares them. */
    readonly initialization: readonly ProgramChunk[] = [],
    /** Where each symbol is defined, and what as. */
    protected _definitions: DefinitionArrays = emptyDefinitions(),
    /** The name each function is shown by in a stack trace or a printed
     *  value: a function declared at the top level its qualified name, and
     *  one a statement writes the name the object engine gave its
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
  body(owner: ProgramChunk, block: number): SequenceRow | undefined {
    return this._sequences.get(blockField(owner, block, B_SEQUENCE));
  }

  /** Every statement chunk of the flows, flow after flow, each block
   *  statement before the statements of its bodies, then the statements of
   *  the functions the declarations write, in the order the declarations
   *  run, which is the order a compile aligns the next program's statements
   *  with. `owners`, when given, receives the owner of each statement of a
   *  body. */
  statementOrder(
    owners?: Map<ProgramChunk, ProgramChunk>,
  ): ProgramChunk[] {
    const out: ProgramChunk[] = [];
    const walk = (row: SequenceRow | undefined, owner?: ProgramChunk) => {
      for (const chunk of row?.arrays.chunks ?? []) {
        out.push(chunk);
        if (owner) {
          owners?.set(chunk, owner);
        }
        walkBodies(chunk);
      }
    };
    const walkBodies = (chunk: ProgramChunk) => {
      for (let k = 0; k < blockCount(chunk); k += 1) {
        walk(this.body(chunk, k), chunk);
      }
    };
    for (const row of this.flowSequences()) {
      walk(row);
    }
    this.initialization.forEach(walkBodies);
    return out;
  }

  /** The statements `statementOrder` lists strictly between `after` and
   *  `before`: from its first when `after` is undefined, and to its last
   *  when `before` is. It walks from where the chunk table places `after`,
   *  so it reads no statement outside the ones it returns, beyond the
   *  owners of `after`. `owners`, when given, receives the owner of each
   *  statement it returns that stands in a body. Nothing is returned when
   *  this root does not hold `after`, or when `limit` statements are listed
   *  without meeting `before`. */
  statementOrderBetween(
    after: ProgramChunk | undefined,
    before: ProgramChunk | undefined,
    limit: number,
    owners?: Map<ProgramChunk, ProgramChunk>,
  ): ProgramChunk[] | undefined {
    const out: ProgramChunk[] = [];
    let met = false;
    let over = false;
    const walk = (
      row: SequenceRow | undefined,
      owner: ProgramChunk | undefined,
      from: number,
    ) => {
      const chunks = row?.arrays.chunks ?? [];
      for (let e = from; e < chunks.length && !met && !over; e += 1) {
        const chunk = chunks[e]!;
        if (chunk === before) {
          met = true;
          return;
        }
        if (out.length >= limit) {
          over = true;
          return;
        }
        out.push(chunk);
        if (owner) {
          owners?.set(chunk, owner);
        }
        walkBodies(chunk, 0);
      }
    };
    const walkBodies = (chunk: ProgramChunk, from: number) => {
      for (let k = from; k < blockCount(chunk) && !met && !over; k += 1) {
        walk(this.body(chunk, k), chunk, 0);
      }
    };
    // What `statementOrder` lists in turn: each flow's sequence, then each
    // body of each declaration chunk.
    const units: { row: SequenceRow | undefined; owner?: ProgramChunk }[] =
      this.flowSequences().map((row) => ({ row }));
    const flowUnits = units.length;
    for (const chunk of this.initialization) {
      for (let k = 0; k < blockCount(chunk); k += 1) {
        units.push({ row: this.body(chunk, k), owner: chunk });
      }
    }
    let next = 0;
    if (after !== undefined) {
      // Where `after` stands, and where each of its owners does, up to the
      // flow's sequence or the declaration whose body holds it.
      const path: ChunkPosition[] = [];
      for (
        let at = this.position(chunkId(after));
        at;
        at = this.ownerOf(at.sequence)
      ) {
        path.push(at);
      }
      const top = path[path.length - 1];
      if (!top || path[0]!.sequence.arrays.chunks[path[0]!.entry] !== after) {
        return undefined;
      }
      if (top.sequence.flow >= 0) {
        next = this.flowSequences().findIndex((row) => row.id === top.sequence.id);
      } else {
        // A declaration chunk, which is not listed: its body is the unit.
        path.pop();
        const declaration = top.sequence.arrays.chunks[top.entry]!;
        const block = path[path.length - 1]?.sequence.block ?? -1;
        next = units.findIndex(
          (unit, u) =>
            u >= flowUnits &&
            unit.owner === declaration &&
            unit.row?.block === block,
        );
      }
      if (next < 0 || path.length === 0) {
        return undefined;
      }
      walkBodies(after, 0);
      path.forEach((at, p) => {
        const owner = path[p + 1];
        const ownerChunk = owner
          ? owner.sequence.arrays.chunks[owner.entry]!
          : units[next]!.owner;
        walk(at.sequence, ownerChunk, at.entry + 1);
        if (owner) {
          walkBodies(ownerChunk!, at.sequence.block + 1);
        }
      });
      next += 1;
    }
    for (let u = next; u < units.length && !met && !over; u += 1) {
      walk(units[u]!.row, units[u]!.owner, 0);
    }
    if (over || (before !== undefined && !met)) {
      return undefined;
    }
    return out;
  }

  /** Chunk id to the id of the sequence that holds the chunk. */
  get chunkIndex(): ChunkTable {
    return this._chunks;
  }

  /** Where each symbol is defined, and what as, which the next compile
   *  writes over where its chunks or flows changed. */
  get definitionArrays(): DefinitionArrays {
    return this._definitions;
  }

  /** Where a symbol is defined: its sequence, entry and offset. A function
   *  and a label are defined where a chunk exports them, and a flow at the
   *  start of its sequence. */
  definition(
    symbol: number,
  ): { sequence: number; entry: number; offset: number } | undefined {
    const at = this.place(symbol);
    return at
      ? { sequence: at.sequence.id, entry: at.entry, offset: at.offset }
      : undefined;
  }

  /** Where a symbol is defined, as a position the engine can stand at, or
   *  nothing when the program does not define it (section 2, A symbol that
   *  disappears). */
  place(
    symbol: number,
  ): { sequence: SequenceRow; entry: number; offset: number } | undefined {
    const defs = this._definitions;
    if (symbol < 0 || symbol >= defs.kind.length) {
      return undefined;
    }
    const chunk = defs.chunk[symbol]!;
    if (chunk >= 0) {
      const at = this.position(chunk);
      return at
        ? { sequence: at.sequence, entry: at.entry, offset: defs.offset[symbol]! }
        : undefined;
    }
    const sequence = this._sequences.get(defs.sequence[symbol]!);
    return sequence ? { sequence, entry: 0, offset: 0 } : undefined;
  }

  /** What this root's program defines `symbol` as (`SymbolKind`), or
   *  `UNDEFINED_KIND`. */
  kindOf(symbol: number): number {
    return this._definitions.kind[symbol] ?? UNDEFINED_KIND;
  }

  /** The scene a branch belongs to, or -1 for any other symbol. */
  parentOf(symbol: number): number {
    return this._definitions.parent[symbol] ?? -1;
  }

  /** The branch a scene enters when it has no content of its own before
   *  it, or -1. */
  startOf(symbol: number): number {
    return this._definitions.start[symbol] ?? -1;
  }

  /** Where the code of the function `symbol` names starts, or nothing when
   *  the program defines no such function. */
  functionEntry(
    symbol: number,
  ): { sequence: SequenceRow; entry: number; offset: number } | undefined {
    if (this.kindOf(symbol) !== SymbolKind.Function) {
      return undefined;
    }
    return this._definitions.chunk[symbol]! >= 0 ? this.place(symbol) : undefined;
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

  // The first line of each body this root has derived (`firstLineOf`).
  protected _bodyLines = new Map<number, number>();

  /** The first line of a sequence in its script, counting from 0: a flow's
   *  and a declaration sequence's as its row holds it, and a body's derived
   *  from where its owner stands (section 1, The order structure): the
   *  owner's first line, then for each body above it the lines of the
   *  owner's parts that head that body and the lines it spans, then the
   *  lines of the parts that head this one. */
  firstLineOf(sequence: SequenceRow): number {
    if (sequence.owner < 0) {
      return sequence.firstLine;
    }
    const known = this._bodyLines.get(sequence.id);
    if (known !== undefined) {
      return known;
    }
    const at = this.position(sequence.owner);
    if (!at) {
      return -1;
    }
    const chunk = at.sequence.arrays.chunks[at.entry]!;
    let line = this.lineOf(at.sequence, at.entry);
    for (let k = 0; k < sequence.block; k += 1) {
      line += blockField(chunk, k, B_HEAD_LINES);
      line += this.body(chunk, k)?.span ?? 0;
    }
    line += blockField(chunk, sequence.block, B_HEAD_LINES);
    this._bodyLines.set(sequence.id, line);
    return line;
  }

  /** Whether `line` falls in the lines `sequence` spans. */
  protected spans(sequence: SequenceRow, line: number): boolean {
    const first = this.firstLineOf(sequence);
    return first <= line && line < first + sequence.span;
  }

  /** The statement a line of a script falls in: the last statement of the
   *  flow holding the line that starts at or above it, and when the line
   *  falls inside one of that statement's bodies, the statement of the body
   *  it falls in, and so on inward. */
  statementAt(uri: string, line: number): ChunkPosition | undefined {
    let holder: SequenceRow | undefined;
    for (const flow of this.flows(uri)) {
      if (this.spans(flow, line)) {
        holder = flow;
      }
    }
    let at = holder ? this.entryAt(holder, line) : undefined;
    while (at) {
      const chunk = at.sequence.arrays.chunks[at.entry]!;
      let inner: ChunkPosition | undefined;
      for (let k = 0; k < blockCount(chunk); k += 1) {
        const body = this.body(chunk, k);
        if (body && this.spans(body, line)) {
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
    const relative = line - this.firstLineOf(sequence);
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
    return this.firstLineOf(sequence) + (sequence.arrays.lineStarts[entry] ?? 0);
  }

  /** The first line of the end of block `block` of the statement at `entry`
   *  of `sequence`: the line after the last line of that block's body. */
  blockEndLine(sequence: SequenceRow, entry: number, block: number): number {
    const chunk = sequence.arrays.chunks[entry]!;
    const body = this.body(chunk, block);
    if (body) {
      return this.firstLineOf(body) + body.span;
    }
    // A body this root does not hold: its lines follow from the block rows.
    let line = this.lineOf(sequence, entry);
    for (let k = 0; k <= block; k += 1) {
      line += blockField(chunk, k, B_HEAD_LINES);
      line += this.body(chunk, k)?.span ?? 0;
    }
    return line;
  }

  /** The source range of line table row `row` of the statement at `entry`
   *  of `sequence`: the row's anchor resolved, which is the statement's
   *  first line or the end of the body the row stands below, and its lines
   *  counted from there. */
  rowRange(sequence: SequenceRow, entry: number, row: number): SourceRange {
    const chunk = sequence.arrays.chunks[entry]!;
    const at = lineTableStart(chunk) + row * LINE_ROW_WORDS;
    const anchor = chunk[at + 1]!;
    const first =
      anchor === ANCHOR_STATEMENT
        ? this.lineOf(sequence, entry)
        : this.blockEndLine(sequence, entry, anchor);
    return {
      startLine: first + chunk[at + 2]!,
      startColumn: chunk[at + 3]!,
      endLine: first + chunk[at + 4]!,
      endColumn: chunk[at + 5]!,
    };
  }

  /** The source range of the instruction at `offset` of the statement at
   *  `entry` of `sequence`: the line table row that covers it, or nothing
   *  when no row does. */
  rangeAt(
    sequence: SequenceRow,
    entry: number,
    offset: number,
  ): SourceRange | null {
    const chunk = sequence.arrays.chunks[entry];
    if (!chunk) {
      return null;
    }
    const row = lineRowAt(chunk, offset);
    return row < 0 ? null : this.rowRange(sequence, entry, row);
  }

  // --------------------------------------------------------------- addresses

  /** Where an address stands: the script and range of the line table row
   *  that covers its offset, the row's anchor resolved, the statement's line
   *  start in its sequence added and, for each owner up to the flow, where
   *  that body starts in its owner and the owner's own line start
   *  (docs/engine/binary-program.md, section 8). An offset no row covers
   *  stands on the statement's first line. Nothing for an address of a chunk
   *  this root does not hold. */
  locationOf(address: number): SourceLocation | undefined {
    if (!Number.isInteger(address) || address < 0) {
      return undefined;
    }
    const at = this.position(chunkOfAddress(address));
    if (!at) {
      return undefined;
    }
    const chunk = at.sequence.arrays.chunks[at.entry]!;
    const offset = offsetOfAddress(address);
    if (offset > codeWords(chunk)) {
      return undefined;
    }
    const range = this.rangeAt(at.sequence, at.entry, offset);
    if (range) {
      return { uri: at.sequence.uri, ...range };
    }
    const line = this.lineOf(at.sequence, at.entry);
    return {
      uri: at.sequence.uri,
      startLine: line,
      startColumn: 0,
      endLine: line,
      endColumn: 0,
    };
  }

  /**
   * The address of the beat or statement on a line of a script, or nothing
   * (docs/engine/binary-program.md, section 8). The flow whose lines hold the
   * line is found among the script's flows, the statement by a binary search
   * of its sequence's line starts, and, when the line falls inside one of
   * that statement's bodies, the statement of that body, and so on inward;
   * then the statement's line table says which of its rows the line is on. A
   * row that holds a `LineStart` names a beat, whose address is the
   * `LineStart`'s offset, so the lines of one beat (a cue line, a directive,
   * the dialogue text) give one address and the lines of two beats give two.
   * Of the rows on the line, the first beat is taken, or with `beat: "last"`
   * the last beat that starts on the line. A line on no beat's row takes the
   * statement's start when it is the statement's first line (a `choose`, an
   * `if`), and otherwise the row that covers the fewest lines, which is the
   * part of the statement it is (an `elseif` condition, a loop's `until`).
   *
   * A line that no row of a statement covers (a blank line, a comment, a
   * line of a block statement's that heads no code of its own, a scene's
   * header) has the address of the first line below it that has one, which
   * is where a story started there runs from. So, unless `functions` is
   * set, does a line of a function's body or of a declaration.
   */
  addressAt(uri: string, line: number, query: AddressQuery = {}): number | undefined {
    const functions = query.functions ?? false;
    const end = this.scriptEnd(uri);
    for (let l = Math.max(0, line); l < end; l += 1) {
      const address = this.addressOn(
        uri,
        l,
        l === line ? (query.beat ?? "first") : "first",
        functions,
      );
      if (address !== undefined) {
        return address;
      }
    }
    return undefined;
  }

  /** The line after the last line a sequence of the script spans. */
  protected scriptEnd(uri: string): number {
    let end = 0;
    for (const flow of this.flows(uri)) {
      end = Math.max(end, flow.firstLine + flow.span);
    }
    const declarations = this.declarations(uri);
    if (declarations) {
      end = Math.max(end, declarations.firstLine + declarations.span);
    }
    return end;
  }

  /** The address of the beat or part a row of the statement holding `line`
   *  puts on that line, or nothing when no row does. */
  protected addressOn(
    uri: string,
    line: number,
    beat: "first" | "last",
    functions: boolean,
  ): number | undefined {
    let holder: SequenceRow | undefined;
    for (const flow of this.flows(uri)) {
      if (this.spans(flow, line)) {
        holder = flow;
      }
    }
    if (holder && !functions && holder.kind === SymbolKind.Function) {
      return undefined;
    }
    const inFlow = holder ? this.addressUnder(holder, line, beat, functions) : undefined;
    if (inFlow !== undefined || !functions) {
      return inFlow;
    }
    const declarations = this.declarations(uri);
    return declarations && this.spans(declarations, line)
      ? this.addressUnder(declarations, line, beat, functions)
      : undefined;
  }

  /** The address a row of the statement of `sequence`, or of one of its
   *  bodies, that holds `line` puts on that line. */
  protected addressUnder(
    sequence: SequenceRow,
    line: number,
    beat: "first" | "last",
    functions: boolean,
  ): number | undefined {
    let at = this.entryOn(sequence, line);
    while (at) {
      const chunk = at.sequence.arrays.chunks[at.entry]!;
      let body: SequenceRow | undefined;
      for (let k = 0; k < blockCount(chunk); k += 1) {
        const candidate = this.body(chunk, k);
        if (candidate && this.spans(candidate, line)) {
          if (!functions && blockFlags(chunk, k) & BLOCK_FUNCTION) {
            return undefined;
          }
          body = candidate;
          break;
        }
      }
      if (!body) {
        return this.addressOnLine(at.sequence, at.entry, line, beat);
      }
      at = this.entryOn(body, line);
    }
    return undefined;
  }

  /** The address of `line` among the statements of `sequence` that start on
   *  it, of which `last` is the last, or of the statement at `last` when it
   *  starts above the line. A line can hold several statements (a label
   *  and the tags written after it): the first beat is the
   *  first statement's that puts an address on the line, and the last beat
   *  the last one's, at its last beat on the line or at its start, as a
   *  line's beats and statements run in the order they are written. */
  protected addressOnLine(
    sequence: SequenceRow,
    last: number,
    line: number,
    beat: "first" | "last",
  ): number | undefined {
    let first = last;
    if (this.lineOf(sequence, last) === line) {
      while (first > 0 && this.lineOf(sequence, first - 1) === line) {
        first -= 1;
      }
    }
    const step = beat === "first" ? 1 : -1;
    for (
      let entry = beat === "first" ? first : last;
      entry >= first && entry <= last;
      entry += step
    ) {
      const address = this.addressIn(sequence, entry, line, beat);
      if (address !== undefined) {
        return address;
      }
    }
    return undefined;
  }

  /** The last entry of `sequence` that starts at or above `line`, or nothing
   *  when every entry starts below it. */
  protected entryOn(sequence: SequenceRow, line: number): ChunkPosition | undefined {
    const at = this.entryAt(sequence, line);
    return at && this.lineOf(sequence, at.entry) <= line ? at : undefined;
  }

  /** The address the rows of the statement at `entry` of `sequence` put on
   *  `line`, as `addressAt` chooses it. */
  protected addressIn(
    sequence: SequenceRow,
    entry: number,
    line: number,
    beat: "first" | "last",
  ): number | undefined {
    const chunk = sequence.arrays.chunks[entry]!;
    const rows = chunk[H_LINE_ROWS]!;
    const words = codeWords(chunk);
    let firstBeat = -1;
    let lastBeatOnLine = -1;
    let part = -1;
    let partLines = Infinity;
    for (let r = 0; r < rows; r += 1) {
      const range = this.rowRange(sequence, entry, r);
      if (range.startLine > line || range.endLine < line) {
        continue;
      }
      const from = chunk[lineTableStart(chunk) + r * LINE_ROW_WORDS]!;
      const to =
        r + 1 < rows
          ? chunk[lineTableStart(chunk) + (r + 1) * LINE_ROW_WORDS]!
          : words;
      const beatAt = lineStartIn(chunk, from, to);
      if (beatAt >= 0) {
        if (firstBeat < 0 || beatAt < firstBeat) {
          firstBeat = beatAt;
        }
        if (range.startLine === line && beatAt > lastBeatOnLine) {
          lastBeatOnLine = beatAt;
        }
      }
      const lines = range.endLine - range.startLine;
      if (lines < partLines || (lines === partLines && from < part)) {
        part = from;
        partLines = lines;
      }
    }
    const offset =
      beat === "last" && lastBeatOnLine >= 0
        ? lastBeatOnLine
        : firstBeat >= 0
          ? firstBeat
          : part < 0
            ? -1
            : line === this.lineOf(sequence, entry)
              ? // The statement's own first line (a `choose`, an `if`'s
                // condition): where the statement starts.
                0
              : part;
    return offset < 0 ? undefined : addressOf(chunkId(chunk), offset);
  }

  /** The flow the chunk of an address stands in: its own sequence, or the
   *  sequence of the flow whose bodies hold it, or a script's declaration
   *  sequence. Nothing for a chunk this root does not hold. */
  flowAt(address: number): SequenceRow | undefined {
    const at = this.position(chunkOfAddress(address));
    let row = at?.sequence;
    while (row && row.owner >= 0) {
      row = this.position(row.owner)?.sequence;
    }
    return row;
  }

  /** The name of the top-level flow an address stands in, as a scene is
   *  entered and a route starts: a scene's name, a branch's scene's, a
   *  function's, or `"0"` for the top-level content; nothing for a
   *  declaration or a chunk this root does not hold. */
  sceneAt(address: number): string | undefined {
    const at = this.position(chunkOfAddress(address));
    return at ? this.sceneOf(at.sequence) : undefined;
  }

  /** The name of the top-level flow a sequence of this root stands in, as
   *  `sceneAt` names it. An included script's top-level content, a flow of
   *  the top-level kind that the top level runs (`IncludeEntry`), stands in
   *  the top level. */
  sceneOf(sequence: SequenceRow): string | undefined {
    let row: SequenceRow | undefined = sequence;
    while (row && row.owner >= 0) {
      row = this.position(row.owner)?.sequence;
    }
    if (!row || row.flow < 0) {
      return undefined;
    }
    if (row.kind === SymbolKind.Root) {
      return "0";
    }
    let symbol = row.flow;
    if (row.kind === SymbolKind.Branch) {
      const scene = this.parentOf(symbol);
      if (scene >= 0) {
        symbol = scene;
      }
    }
    const name = this.table.symbols[symbol] ?? "";
    return name === "" ? "0" : name;
  }
}

/** The offset of the first `LineStart` in the code of `chunk` from `from` up
 *  to `to`, or -1. */
const lineStartIn = (chunk: ProgramChunk, from: number, to: number): number => {
  for (let offset = from; offset < to; offset += 2) {
    if (opOf(chunk[HEADER_WORDS + offset]!) === Op.LineStart) {
      return offset;
    }
  }
  return -1;
};
