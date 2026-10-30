import type { ProgramTable } from "./ProgramTable";
import type {
  AddressQuery,
  SourceLocation,
} from "../compiler/types/ProgramAddress";
import type { StructDefinitionTable } from "../runtime/StructDefinition";
import {
  SymbolKind,
  UNDEFINED_KIND,
  readableSymbolLabel,
  type SymbolKindValue,
} from "./ProgramSymbols";
import { DONE_HOLD, Op, flagsOf, opOf } from "./ProgramInstructions";
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

export interface SequenceArrays {
  readonly chunks: readonly ProgramChunk[];
  readonly lineStarts: readonly number[];
}

export interface SequenceRow {
  readonly id: number;
  readonly arrays: SequenceArrays;
  readonly flow: number;
  readonly kind: SymbolKindValue;
  readonly owner: number;
  readonly block: number;
  readonly uri: string;
  readonly firstLine: number;
  readonly span: number;
}

export interface SourceRange {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

const PAGE_BITS = 10;
const PAGE_SIZE = 1 << PAGE_BITS;

export class ChunkTable {
  constructor(protected _pages: (Int32Array | undefined)[] = []) {}

  get(id: number): number {
    return this._pages[id >> PAGE_BITS]?.[id & (PAGE_SIZE - 1)] ?? -1;
  }

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

export interface ChunkPosition {
  sequence: SequenceRow;
  entry: number;
}

export interface DefinitionArrays {
  chunk: Int32Array;
  offset: Int32Array;
  sequence: Int32Array;
  kind: Int8Array;
  parent: Int32Array;
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

export const holdsChunk = (
  arrays: SequenceArrays,
  chunk: ProgramChunk,
): boolean => {
  const entry = entryIndex(arrays).get(chunkId(chunk));
  return entry !== undefined && arrays.chunks[entry] === chunk;
};

export const holdsChunkIn = (
  root: ProgramRoot,
  chunk: ProgramChunk,
): boolean => {
  const at = root.position(chunkId(chunk));
  return !!at && at.sequence.arrays.chunks[at.entry] === chunk;
};

export interface ProgramStoryTables {
  readonly structDefinitions: StructDefinitionTable;
  readonly constantNames: ReadonlySet<string>;
}

export interface RunFile {
  readonly uri: string;
  readonly label: string;
}

export class ProgramRoot {
  constructor(
    readonly table: ProgramTable,
    readonly id: number,
    readonly since: number,
    protected _sequences: ReadonlyMap<number, SequenceRow>,
    protected _flows: ReadonlyMap<number, number>,
    protected _scriptFlows: ReadonlyMap<string, readonly number[]>,
    protected _chunks: ChunkTable,
    readonly generation: number,
    readonly tables: ProgramStoryTables | null = null,
    protected _declarations: ReadonlyMap<string, number> = new Map(),
    readonly initialization: readonly ProgramChunk[] = [],
    protected _definitions: DefinitionArrays = emptyDefinitions(),
    protected _labels: ReadonlyMap<number, string> = new Map(),
    protected _symbolRemaps: readonly Int32Array[] = [],
    protected _runFiles: ReadonlyMap<number, RunFile> = new Map(),
  ) {}

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

  flow(symbol: number): SequenceRow | undefined {
    const id = this._flows.get(symbol);
    return id === undefined ? undefined : this._sequences.get(id);
  }

  flowNamed(name: string): SequenceRow | undefined {
    const symbol = this.table.symbolIds.get(name);
    return symbol === undefined ? undefined : this.flow(symbol);
  }

  sequence(id: number): SequenceRow | undefined {
    return this._sequences.get(id);
  }

  sequences(): IterableIterator<SequenceRow> {
    return this._sequences.values();
  }

  declarations(uri: string): SequenceRow | undefined {
    const id = this._declarations.get(uri);
    return id === undefined ? undefined : this._sequences.get(id);
  }

  flowSequences(): SequenceRow[] {
    return [...this._flows.values()].map((id) => this._sequences.get(id)!);
  }

  body(owner: ProgramChunk, block: number): SequenceRow | undefined {
    return this._sequences.get(blockField(owner, block, B_SEQUENCE));
  }

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

  get chunkIndex(): ChunkTable {
    return this._chunks;
  }

  get definitionArrays(): DefinitionArrays {
    return this._definitions;
  }

  definition(
    symbol: number,
  ): { sequence: number; entry: number; offset: number } | undefined {
    const at = this.place(symbol);
    return at
      ? { sequence: at.sequence.id, entry: at.entry, offset: at.offset }
      : undefined;
  }

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

  kindOf(symbol: number): number {
    return this._definitions.kind[symbol] ?? UNDEFINED_KIND;
  }

  parentOf(symbol: number): number {
    return this._definitions.parent[symbol] ?? -1;
  }

  startOf(symbol: number): number {
    return this._definitions.start[symbol] ?? -1;
  }

  functionEntry(
    symbol: number,
  ): { sequence: SequenceRow; entry: number; offset: number } | undefined {
    if (this.kindOf(symbol) !== SymbolKind.Function) {
      return undefined;
    }
    return this._definitions.chunk[symbol]! >= 0 ? this.place(symbol) : undefined;
  }

  labelOf(symbol: number): string {
    return this._labels.get(symbol) ?? this.table.symbols[symbol] ?? "";
  }

  runFileOf(symbol: number): RunFile | undefined {
    return this._runFiles.get(symbol);
  }

  shownLabelOf(symbol: number): string {
    const file = this._runFiles.get(symbol);
    if (file) {
      return file.label;
    }
    const label = readableSymbolLabel(this.labelOf(symbol));
    if (this._runFiles.size === 0) {
      return label;
    }
    const flow = this.place(symbol)?.sequence.flow;
    const holder = flow === undefined ? undefined : this._runFiles.get(flow);
    const wrapper = holder ? this.table.symbols[flow!] : undefined;
    return holder && wrapper && label.startsWith(`${wrapper}.`)
      ? `${holder.label}${label.slice(wrapper.length)}`
      : label;
  }

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

  ownerOf(sequence: SequenceRow): ChunkPosition | undefined {
    return sequence.owner < 0 ? undefined : this.position(sequence.owner);
  }

  flows(uri: string): SequenceRow[] {
    const ids = this._scriptFlows.get(uri) ?? [];
    return ids.map((id) => this._sequences.get(id)!);
  }

  protected _bodyLines = new Map<number, number>();

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

  protected spans(sequence: SequenceRow, line: number): boolean {
    const first = this.firstLineOf(sequence);
    return first <= line && line < first + sequence.span;
  }

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

  lineOf(sequence: SequenceRow, entry: number): number {
    return this.firstLineOf(sequence) + (sequence.arrays.lineStarts[entry] ?? 0);
  }

  blockEndLine(sequence: SequenceRow, entry: number, block: number): number {
    const chunk = sequence.arrays.chunks[entry]!;
    const body = this.body(chunk, block);
    if (body) {
      return this.firstLineOf(body) + body.span;
    }
    let line = this.lineOf(sequence, entry);
    for (let k = 0; k <= block; k += 1) {
      line += blockField(chunk, k, B_HEAD_LINES);
      line += this.body(chunk, k)?.span ?? 0;
    }
    return line;
  }

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

  optionAt(uri: string, line: number): number | undefined {
    const address = this.addressAt(uri, line);
    if (address === undefined) {
      return undefined;
    }
    const id = chunkOfAddress(address);
    const at = this.position(id);
    const chunk = at?.sequence.arrays.chunks[at.entry];
    if (!chunk) {
      return undefined;
    }
    const words = codeWords(chunk);
    for (let offset = 0; offset < words; offset += 2) {
      if (opOf(chunk[HEADER_WORDS + offset]!) !== Op.Choice) {
        continue;
      }
      const option = addressOf(id, offset);
      const location = this.locationOf(option);
      if (location?.uri === uri && location.startLine === line) {
        return option;
      }
    }
    return undefined;
  }

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

  protected entryOn(sequence: SequenceRow, line: number): ChunkPosition | undefined {
    const at = this.entryAt(sequence, line);
    return at && this.lineOf(sequence, at.entry) <= line ? at : undefined;
  }

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
              ?
                0
              : part;
    return offset < 0 ? undefined : addressOf(chunkId(chunk), offset);
  }

  flowAt(address: number): SequenceRow | undefined {
    const at = this.position(chunkOfAddress(address));
    let row = at?.sequence;
    while (row && row.owner >= 0) {
      row = this.position(row.owner)?.sequence;
    }
    return row;
  }

  flowEndAddress(uri: string, header: number): number | undefined {
    const flow = this.flowHeadedAt(uri, header);
    const entry = flow ? this.flowEndEntry(flow) : -1;
    if (entry < 0) {
      return undefined;
    }
    const chunks = flow!.arrays.chunks;
    const before = chunks[entry - 1];
    if (before && !runsOffItsEnd(before)) {
      return undefined;
    }
    return addressOf(chunkId(chunks[entry]!), 0);
  }

  flowEndEntry(sequence: SequenceRow): number {
    if (
      sequence.owner >= 0 ||
      (sequence.kind !== SymbolKind.Scene && sequence.kind !== SymbolKind.Branch)
    ) {
      return -1;
    }
    const chunks = sequence.arrays.chunks;
    const end = chunks.at(-1);
    return end &&
      codeWords(end) === 2 &&
      opOf(end[HEADER_WORDS]!) === Op.Done &&
      (flagsOf(end[HEADER_WORDS]!) & DONE_HOLD) === 0
      ? chunks.length - 1
      : -1;
  }

  bindsParameters(uri: string, header: number): boolean {
    const chunk = this.flowHeadedAt(uri, header)?.arrays.chunks[0];
    return (
      chunk !== undefined &&
      codeWords(chunk) > 0 &&
      opOf(chunk[HEADER_WORDS]!) === Op.SetVar
    );
  }

  protected flowHeadedAt(uri: string, header: number): SequenceRow | undefined {
    return this.flows(uri).find(
      (flow) =>
        (flow.kind === SymbolKind.Scene || flow.kind === SymbolKind.Branch) &&
        this.firstLineOf(flow) === header + 1,
    );
  }

  sceneAt(address: number): string | undefined {
    const at = this.position(chunkOfAddress(address));
    return at ? this.sceneOf(at.sequence) : undefined;
  }

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

const lineStartIn = (chunk: ProgramChunk, from: number, to: number): number => {
  for (let offset = from; offset < to; offset += 2) {
    if (opOf(chunk[HEADER_WORDS + offset]!) === Op.LineStart) {
      return offset;
    }
  }
  return -1;
};

const runsOffItsEnd = (chunk: ProgramChunk): boolean => {
  const words = codeWords(chunk);
  if (words < 2) {
    return true;
  }
  const last = chunk[HEADER_WORDS + words - 2]!;
  const op = opOf(last);
  if (
    op !== Op.End &&
    op !== Op.JumpSym &&
    op !== Op.JumpVar &&
    op !== Op.TunnelReturn &&
    (op !== Op.Done || (flagsOf(last) & DONE_HOLD) !== 0)
  ) {
    return true;
  }
  for (let offset = 0; offset < words; offset += 2) {
    const at = opOf(chunk[HEADER_WORDS + offset]!);
    if (
      (at === Op.Jump ||
        at === Op.JumpIfFalse ||
        at === Op.JumpIfKeep ||
        at === Op.Thread ||
        at === Op.Choice) &&
      offset + 2 + chunk[HEADER_WORDS + offset + 1]! === words
    ) {
      return true;
    }
  }
  return false;
};
