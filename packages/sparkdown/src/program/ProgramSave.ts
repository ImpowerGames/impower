import { JsonSerialisation } from "../inkjs/engine/JsonSerialisation";
import { SimpleJson } from "../inkjs/engine/SimpleJson";
import type { SymbolValue } from "../inkjs/engine/Value";
import { chunkPartsOf, type ChunkPartKind } from "./chunkParts";
import { hash64 } from "./hash64";
import type { ProgramRoot, SequenceRow } from "./ProgramRoot";
import {
  SymbolKind,
  UNDEFINED_KIND,
  countIdOf,
  isAnonymousSymbol,
} from "./ProgramSymbols";
import type {
  ProgramChoice,
  ProgramPosition,
  ProgramStoryState,
  StateCodec,
} from "./ProgramStoryState";
import {
  BLOCK_LOOP,
  H_FINGERPRINT,
  H_LAYOUT_HASH,
  addressOf,
  blockFlags,
  chunkId,
  chunkOfAddress,
  codeWords,
  offsetOfAddress,
  type StatementChunk,
} from "./StatementChunk";

/**
 * The durable save of the program engine (docs/engine/binary-program.md,
 * sections 7 and 8): the image of the newest beat, with every position, every
 * anonymous symbol and every count written in the saved form, so that it
 * loads into another process, after the program table was reseeded and the
 * program compiled again from the same source.
 *
 * A position is written as the chain of sequences that holds it, from its
 * flow (by qualified name) or its script's declaration sequence (by uri)
 * down, each level a window of its sequence's listing (the fingerprints of
 * its entries) and the ordinal of the entry the position is in, with, for a
 * body, the block of the owner's chunk it is and, for a loop's body, the
 * owner's layout hash; then the anchor: the statement's start, the end of
 * the sequence, or an offset in the statement's code beside its layout hash.
 * A frame names its function and the layout hash of the chunk that bound
 * its parameters. A named symbol is written by its qualified name, and an
 * anonymous one (a function a statement writes, an alternator, a choice) by
 * its statement and its part: the part's kind, its ordinal among the
 * statement's parts of that kind and the hash of its own source.
 *
 * This slice loads a save into a program whose statements are unchanged:
 * each level's window must read as the sequence does now, and an offset's
 * statement must have the layout it had. Anything else is refused, naming
 * the flow, and nothing is matched approximately; placing a save in a
 * program that differs is #1429's, which may change the format.
 */

/** The format version this engine writes, and the newest it reads. */
export const SAVE_FORMAT = 1;

/** The version of the engine, which a save's header names beside the
 *  format's. */
export const PROGRAM_ENGINE_VERSION = "1";

/** What a save's header says. */
export interface SaveHeader {
  format: number;
  engine: string;
  engineVersion: string;
  /** The game's own version string (`GameConfiguration.version`), empty
   *  when the game set none. */
  gameVersion: string;
}

/** A save the loader cannot place, naming the flow it is in. */
export class SaveRefused extends Error {
  constructor(
    message: string,
    readonly flow: string | null = null,
  ) {
    super(message);
    this.name = "SaveRefused";
  }
}

/** The migration of a save of each older format version to the next one.
 *  A format version that shipped keeps its migration, and a fixture save
 *  of it stays in the tests. */
const MIGRATIONS: Record<number, (save: Record<string, any>) => Record<string, any>> =
  {};

// A 64-bit hash of a chunk, as 16 hex digits.
const hex = (chunk: StatementChunk, at: number): string =>
  (chunk[at]! >>> 0).toString(16).padStart(8, "0") +
  (chunk[at + 1]! >>> 0).toString(16).padStart(8, "0");

export const fingerprintOf = (chunk: StatementChunk): string =>
  hex(chunk, H_FINGERPRINT);

export const layoutOf = (chunk: StatementChunk): string =>
  hex(chunk, H_LAYOUT_HASH);

// A part's fingerprint, the normalized source the store aligns it by, as
// 16 hex digits.
const partPrint = (fingerprint: string): string =>
  hash64(fingerprint)
    .map((word) => (word >>> 0).toString(16).padStart(8, "0"))
    .join("");

/** A level of a saved statement: the listing of its sequence (`s`, an
 *  index into the save's listings) and the entry's ordinal (`at`); the
 *  first level names its flow or its script's declaration sequence, and
 *  each level after it the block of the owner's chunk its sequence is, with
 *  the owner's layout hash when the owner is a loop. */
interface SavedLevel {
  s: number;
  at: number;
  flow?: string;
  decl?: string;
  block?: number;
  loop?: string;
}

interface SavedStatement {
  levels: SavedLevel[];
}

/** An anchor: the statement's start, the end of the sequence, or an offset
 *  in the statement's code with the statement's layout hash. */
type SavedAnchor = "start" | "end" | [number, string];

interface SavedPosition {
  st: SavedStatement;
  a: SavedAnchor;
}

/** A symbol: by its qualified name, or by its statement and part. */
type SavedSymbol =
  | { n: string }
  | { st: SavedStatement; k: ChunkPartKind; i: number; p: string };

// The windows of one sequence's listing a save cuts: a sequence of up to
// 512 entries whole, and otherwise 256 entries on each side of each
// position the save names in it, merged where they overlap.
const WHOLE_LISTING = 512;
const WINDOW_SIDE = 256;

interface Listing {
  index: number;
  sequence: SequenceRow;
  ranges: [number, number][];
}

/** Writes a state in the saved form. */
class SaveWriter implements StateCodec {
  protected _listings = new Map<number, Listing>();
  protected _owners: Map<number, { chunk: StatementChunk; kind: ChunkPartKind; index: number }> | null =
    null;

  constructor(
    protected _state: ProgramStoryState,
    protected _gameVersion: string,
  ) {}

  protected get root(): ProgramRoot {
    return this._state.root;
  }

  begin(writer: SimpleJson.Writer): void {
    JsonSerialisation.SetWriterSymbolEncoder(writer, (value) =>
      JSON.stringify(this.symbolForm(this.symbolOf(value), value.ref.label)),
    );
  }

  header(writer: SimpleJson.Writer): void {
    writer.WriteIntProperty("format", SAVE_FORMAT);
    writer.WriteProperty("engineVersion", PROGRAM_ENGINE_VERSION);
    writer.WriteProperty("gameVersion", this._gameVersion);
  }

  end(writer: SimpleJson.Writer): void {
    // The listings, which every saved position names by index, cut last,
    // once every position is known.
    const listings = [...this._listings.values()].sort((a, b) => a.index - b.index);
    writer.WriteProperty("listings", (w) => {
      w.WriteArrayStart();
      for (const listing of listings) {
        const chunks = listing.sequence.arrays.chunks;
        w.WriteObjectStart();
        w.WriteIntProperty("n", chunks.length);
        w.WriteProperty("windows", (ww) => {
          ww.WriteArrayStart();
          for (const [from, to] of merged(listing.ranges)) {
            ww.WriteArrayStart();
            ww.WriteInt(from);
            for (let e = from; e < to; e += 1) {
              ww.Write(fingerprintOf(chunks[e]!));
            }
            ww.WriteArrayEnd();
          }
          ww.WriteArrayEnd();
        });
        w.WriteObjectEnd();
      }
      w.WriteArrayEnd();
    });
  }

  position(writer: SimpleJson.Writer, position: ProgramPosition | null): void {
    if (!position) {
      writer.WriteNull();
      return;
    }
    writer.WriteInjected(this.positionForm(position));
  }

  frameSymbol(writer: SimpleJson.Writer, symbol: number): void {
    if (symbol < 0) {
      return;
    }
    writer.WritePropertyStart("fn");
    writer.WriteInjected(this.symbolForm(symbol, this.root.labelOf(symbol)));
    writer.WritePropertyEnd();
    // The chunk that bound the function's parameters, whose layout says
    // whether the frame's temporaries mean what they meant.
    if (this.root.kindOf(symbol) === SymbolKind.Function) {
      const place = this.root.place(symbol);
      const chunk = place?.sequence.arrays.chunks[place.entry];
      if (chunk) {
        writer.WriteProperty("bound", layoutOf(chunk));
      }
    }
  }

  // A choice's identity is the address of its `Choice`, which stands in
  // the chunk of the choice's entry: the offset there.
  choiceSource(writer: SimpleJson.Writer, choice: ProgramChoice): void {
    const chunk = choice.target.sequence.arrays.chunks[choice.target.entry];
    const address = Number(choice.sourcePath);
    if (chunk && Number.isFinite(address)) {
      writer.WriteIntProperty("source", address - addressOf(chunkId(chunk), 0));
    }
  }

  // Each count, by its symbol's saved form, with its visits and the turn of
  // its last visit.
  counts(writer: SimpleJson.Writer): void {
    const state = this._state;
    const table = this.root.table;
    const symbolOf: number[] = [];
    table.countIds.forEach((id, symbol) => {
      if (id >= 0) symbolOf[id] = symbol;
    });
    writer.WriteProperty("counts", (w) => {
      w.WriteArrayStart();
      const size = Math.max(state.visits.length, state.turns.length);
      for (let id = 0; id < size; id += 1) {
        const visits = state.visits[id] ?? 0;
        const turn = state.turns[id] ?? NEVER_VISITED;
        const symbol = symbolOf[id];
        if ((visits === 0 && turn === NEVER_VISITED) || symbol === undefined) {
          continue;
        }
        if (this.root.kindOf(symbol) === UNDEFINED_KIND) {
          continue;
        }
        w.WriteInjected([
          this.symbolForm(symbol, table.symbols[symbol]!),
          visits,
          turn === NEVER_VISITED ? null : turn,
        ]);
      }
      w.WriteArrayEnd();
    });
  }

  place(): ProgramPosition | null {
    throw new Error("A save writer reads nothing.");
  }

  readFrameSymbol(): number {
    throw new Error("A save writer reads nothing.");
  }

  readChoiceSource(): string {
    throw new Error("A save writer reads nothing.");
  }

  readCounts(): void {
    throw new Error("A save writer reads nothing.");
  }

  // The symbol a function value names in this root.
  protected symbolOf(value: SymbolValue): number {
    const ref = value.ref;
    const root = this.root;
    const id =
      ref.generation === root.generation
        ? ref.symbol
        : root.symbolFrom(ref.symbol, ref.generation);
    if (id !== undefined && (ref.name === null || root.table.symbols[id] === ref.name)) {
      return id;
    }
    const named = ref.name === null ? undefined : root.table.symbolIds.get(ref.name);
    if (named === undefined) {
      throw new Error(`The function value ${ref.label} names nothing in its program.`);
    }
    return named;
  }

  protected symbolForm(symbol: number, label: string): SavedSymbol {
    const table = this.root.table;
    if (!isAnonymousSymbol(table, symbol)) {
      return { n: table.symbols[symbol]! };
    }
    const owner = this.owners().get(symbol);
    const at = owner ? this.root.position(chunkId(owner.chunk)) : undefined;
    if (!owner || !at) {
      throw new Error(`The anonymous symbol of ${label} has no statement in its program.`);
    }
    const part = chunkPartsOf(owner.chunk)![owner.kind][owner.index]!;
    return {
      st: this.statementForm(at.sequence, at.entry),
      k: owner.kind,
      i: owner.index,
      p: partPrint(part.fingerprint),
    };
  }

  // Each anonymous symbol of the root's statements, by the statement and
  // part that own it.
  protected owners() {
    if (!this._owners) {
      const owners = new Map<number, { chunk: StatementChunk; kind: ChunkPartKind; index: number }>();
      const root = this.root;
      for (const chunk of [...root.statementOrder(), ...root.initialization]) {
        const parts = chunkPartsOf(chunk);
        if (!parts) continue;
        for (const kind of ["functions", "alternators", "choices"] as const) {
          parts[kind].forEach((part, index) => {
            if (part.symbol >= 0 && !owners.has(part.symbol)) {
              owners.set(part.symbol, { chunk, kind, index });
            }
          });
        }
      }
      this._owners = owners;
    }
    return this._owners;
  }

  protected positionForm(position: ProgramPosition): SavedPosition {
    const { sequence, entry, offset } = position;
    const chunk = sequence.arrays.chunks[entry];
    const a: SavedAnchor = !chunk
      ? "end"
      : offset === 0
        ? "start"
        : [offset, layoutOf(chunk)];
    return { st: this.statementForm(sequence, entry), a };
  }

  // The chain of levels from the flow down to `entry` of `sequence`.
  protected statementForm(sequence: SequenceRow, entry: number): SavedStatement {
    const root = this.root;
    const levels: SavedLevel[] = [];
    let at = sequence;
    let e = entry;
    for (;;) {
      const level: SavedLevel = { s: this.listing(at, e), at: e };
      if (at.owner < 0) {
        if (at.flow >= 0) {
          level.flow = root.table.symbols[at.flow]!;
        } else {
          level.decl = at.uri;
        }
        levels.unshift(level);
        break;
      }
      const owner = root.position(at.owner);
      if (!owner) {
        throw new Error("A saved position is in a body whose owner its program does not hold.");
      }
      const ownerChunk = owner.sequence.arrays.chunks[owner.entry]!;
      level.block = at.block;
      if (blockFlags(ownerChunk, at.block) & BLOCK_LOOP) {
        level.loop = layoutOf(ownerChunk);
      }
      levels.unshift(level);
      at = owner.sequence;
      e = owner.entry;
    }
    return { levels };
  }

  protected listing(sequence: SequenceRow, entry: number): number {
    let listing = this._listings.get(sequence.id);
    if (!listing) {
      listing = { index: this._listings.size, sequence, ranges: [] };
      this._listings.set(sequence.id, listing);
    }
    const n = sequence.arrays.chunks.length;
    listing.ranges.push(
      n <= WHOLE_LISTING
        ? [0, n]
        : [Math.max(0, entry - WINDOW_SIDE), Math.min(n, entry + WINDOW_SIDE + 1)],
    );
    return listing.index;
  }
}

const NEVER_VISITED = -0x80000000;

const merged = (ranges: [number, number][]): [number, number][] => {
  const sorted = ranges.slice().sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const [from, to] of sorted) {
    const last = out[out.length - 1];
    if (last && from <= last[1]) {
      last[1] = Math.max(last[1], to);
    } else {
      out.push([from, to]);
    }
  }
  return out;
};

/** Reads a state in the saved form into an engine whose program has the
 *  statements the save names, unchanged. */
class SaveReader implements StateCodec {
  // The listings already compared with the sequence each names.
  protected _checked = new Map<number, number>();

  constructor(
    protected _state: ProgramStoryState,
    protected _listings: { n: number; windows: (number | string)[][] }[],
    protected _symbolValue: (symbol: number) => SymbolValue,
  ) {}

  protected get root(): ProgramRoot {
    return this._state.root;
  }

  position(): void {
    throw new Error("A save reader writes nothing.");
  }

  frameSymbol(): void {
    throw new Error("A save reader writes nothing.");
  }

  choiceSource(): void {
    throw new Error("A save reader writes nothing.");
  }

  counts(): void {
    throw new Error("A save reader writes nothing.");
  }

  // Places every position and every function value of the save, frame by
  // frame and choice by choice, before anything is read into the state.
  check(obj: Record<string, any>): void {
    const frames = (saved: unknown) => {
      for (const frame of Array.isArray(saved) ? saved : []) {
        this.place(frame?.["returnTo"]);
        this.readFrameSymbol(frame ?? {});
      }
    };
    this.place(obj["position"]);
    frames(obj["frames"]);
    for (const thread of Array.isArray(obj["threads"]) ? obj["threads"] : []) {
      this.place(thread?.["position"]);
      frames(thread?.["frames"]);
    }
    for (const choice of Array.isArray(obj["choices"]) ? obj["choices"] : []) {
      this.place(choice?.["target"]);
      frames(choice?.["frames"]);
    }
    const values = (token: unknown): void => {
      if (Array.isArray(token)) {
        token.forEach(values);
      } else if (token && typeof token === "object") {
        const saved = (token as Record<string, unknown>)["^symsave"];
        if (typeof saved === "string") {
          this.decodeSymbol(JSON.parse(saved) as SavedSymbol, true);
        }
        Object.values(token).forEach(values);
      }
    };
    values(obj);
  }

  beginRead(): void {
    JsonSerialisation.SetLoadSessionSymbolDecoder((saved) =>
      this._symbolValue(this.decodeSymbol(JSON.parse(saved) as SavedSymbol, true)!),
    );
  }

  place(saved: unknown): ProgramPosition | null {
    if (saved === null || saved === undefined) {
      return null;
    }
    const form = saved as SavedPosition;
    const { sequence, entry, flow } = this.placeStatement(form.st);
    const chunk = sequence.arrays.chunks[entry];
    if (form.a === "end") {
      if (chunk) {
        throw this.refused(flow, "its position is no longer at the end of its sequence");
      }
      return { sequence, entry, offset: 0 };
    }
    if (!chunk) {
      throw this.refused(flow, "its statement is gone");
    }
    if (form.a === "start") {
      return { sequence, entry, offset: 0 };
    }
    const [offset, layout] = form.a;
    if (layoutOf(chunk) !== layout) {
      throw this.refused(flow, "a statement it is inside was compiled to other code");
    }
    return { sequence, entry, offset };
  }

  readFrameSymbol(saved: Record<string, any>): number {
    const form = saved["fn"] as SavedSymbol | undefined;
    if (!form || typeof form !== "object") {
      return -1;
    }
    const symbol = this.decodeSymbol(form, true)!;
    const bound = saved["bound"];
    if (typeof bound === "string") {
      const place = this.root.place(symbol);
      const chunk = place?.sequence.arrays.chunks[place.entry];
      if (!chunk || layoutOf(chunk) !== bound) {
        throw this.refused(
          this.root.labelOf(symbol),
          "the function a frame runs binds its parameters in other code",
        );
      }
    }
    return symbol;
  }

  readChoiceSource(saved: Record<string, any>, target: ProgramPosition): string {
    const chunk = target.sequence.arrays.chunks[target.entry];
    const source = saved["source"];
    return chunk && typeof source === "number"
      ? String(addressOf(chunkId(chunk), source))
      : "";
  }

  // A count whose symbol the program no longer has is dropped
  // (docs/engine/binary-program.md, section 2).
  readCounts(obj: Record<string, any>): void {
    const state = this._state;
    for (const entry of Array.isArray(obj["counts"]) ? obj["counts"] : []) {
      const [form, visits, turn] = entry as [SavedSymbol, number, number | null];
      const symbol = this.decodeSymbol(form, false);
      if (symbol === undefined) continue;
      const id = countIdOf(this.root.table, symbol);
      state.SetCount(id, Number(visits), turn === null ? null : Number(turn));
    }
  }

  // The symbol a saved form names here, or nothing (or a refusal, when
  // `required`) when the program has none.
  protected decodeSymbol(form: SavedSymbol, required: boolean): number | undefined {
    const root = this.root;
    if ("n" in form) {
      const symbol = root.table.symbolIds.get(form.n);
      if (symbol === undefined || root.kindOf(symbol) === UNDEFINED_KIND) {
        if (required) throw this.refused(form.n, "its program no longer has it");
        return undefined;
      }
      return symbol;
    }
    let placed: { sequence: SequenceRow; entry: number; flow: string } | undefined;
    try {
      placed = this.placeStatement(form.st);
    } catch (e) {
      if (required) throw e;
      return undefined;
    }
    const chunk = placed.sequence.arrays.chunks[placed.entry];
    const part = chunk ? chunkPartsOf(chunk)?.[form.k]?.[form.i] : undefined;
    if (!part || part.symbol < 0 || partPrint(part.fingerprint) !== form.p) {
      if (required) throw this.refused(placed.flow, "a part of a statement it names is gone");
      return undefined;
    }
    return part.symbol;
  }

  // The sequence and entry a saved statement names, its levels placed one
  // by one, each level's listing compared with its sequence.
  protected placeStatement(st: SavedStatement): {
    sequence: SequenceRow;
    entry: number;
    flow: string;
  } {
    const root = this.root;
    const first = st.levels[0];
    const flow = first?.flow ?? first?.decl ?? "";
    const top: SequenceRow | undefined =
      first?.flow !== undefined
        ? root.flowNamed(first.flow)
        : first?.decl !== undefined
          ? root.declarations(first.decl)
          : undefined;
    if (!first || !top) {
      throw this.refused(flow, "its program has no such flow");
    }
    let sequence: SequenceRow = top;
    let entry = first.at;
    this.compare(first.s, sequence, flow);
    for (let i = 1; i < st.levels.length; i += 1) {
      const level = st.levels[i]!;
      const owner: StatementChunk | undefined = sequence.arrays.chunks[entry];
      const body: SequenceRow | undefined =
        owner && level.block !== undefined ? root.body(owner, level.block) : undefined;
      if (!owner || !body) {
        throw this.refused(flow, "a block it is inside is gone");
      }
      if (level.loop !== undefined && layoutOf(owner) !== level.loop) {
        throw this.refused(flow, "a loop it is inside was compiled to other code");
      }
      sequence = body;
      entry = level.at;
      this.compare(level.s, sequence, flow);
    }
    return { sequence, entry, flow };
  }

  // Whether listing `index` reads as `sequence` does now: as many entries,
  // and each fingerprint of each window the one the entry has.
  protected compare(index: number, sequence: SequenceRow, flow: string): void {
    if (this._checked.get(index) === sequence.id) {
      return;
    }
    const listing = this._listings[index];
    const chunks = sequence.arrays.chunks;
    let same = listing !== undefined && listing.n === chunks.length;
    for (const window of listing?.windows ?? []) {
      const from = Number(window[0]);
      for (let j = 1; same && j < window.length; j += 1) {
        const chunk = chunks[from + j - 1];
        same = chunk !== undefined && fingerprintOf(chunk) === window[j];
      }
    }
    if (!same) {
      throw this.refused(flow, "its statements differ from those of the program that saved it");
    }
    this._checked.set(index, sequence.id);
  }

  protected refused(flow: string, why: string): SaveRefused {
    const name = flow === "" ? "the top level" : `'${flow}'`;
    return new SaveRefused(
      `The save cannot be placed in this program: in ${name}, ${why}.`,
      flow,
    );
  }
}

/** The state as a durable save. */
export const writeSave = (
  state: ProgramStoryState,
  gameVersion: string,
): string => state.writeState(new SaveWriter(state, gameVersion));

/** Reads a durable save into `state`, and returns its header. A save of an
 *  older format goes through the migration of each version after it; one
 *  of a newer format, one written by another engine, and one that cannot be
 *  placed are refused, and the state is left as it was. */
export const readSave = (
  state: ProgramStoryState,
  json: string,
  symbolValue: (symbol: number) => SymbolValue,
): SaveHeader => {
  const { save, format } = parseSave(json);
  const listings = Array.isArray(save["listings"]) ? save["listings"] : [];
  state.readState(save, new SaveReader(state, listings, symbolValue));
  return {
    format,
    engine: String(save["engine"]),
    engineVersion: String(save["engineVersion"] ?? ""),
    gameVersion: String(save["gameVersion"] ?? ""),
  };
};

/** Throws what `readSave` would refuse a save for, and changes nothing. */
export const checkSave = (
  state: ProgramStoryState,
  json: string,
  symbolValue: (symbol: number) => SymbolValue,
): void => {
  const { save } = parseSave(json);
  const listings = Array.isArray(save["listings"]) ? save["listings"] : [];
  new SaveReader(state, listings, symbolValue).check(save);
};

// A save's JSON, of this engine and taken through the migration of each
// older format version, or a refusal.
const parseSave = (
  json: string,
): { save: Record<string, any>; format: number } => {
  let save = SimpleJson.TextToDictionary(json) as Record<string, any>;
  if (save["engine"] !== "program") {
    throw new SaveRefused("The save was not written by the program engine.");
  }
  const format = Number(save["format"]);
  if (!Number.isInteger(format) || format < 1) {
    throw new SaveRefused("The save names no format version.");
  }
  if (format > SAVE_FORMAT) {
    throw new SaveRefused(
      `The save is of format version ${format}, newer than this engine reads (${SAVE_FORMAT}).`,
    );
  }
  for (let v = format; v < SAVE_FORMAT; v += 1) {
    const migrate = MIGRATIONS[v];
    if (!migrate) {
      throw new SaveRefused(`The save's format version ${v} has no migration.`);
    }
    save = migrate(save);
  }
  return { save, format };
};

/** An address in a form that outlives the process that wrote it: the chain
 *  of levels from its flow (by qualified name) or its script's declaration
 *  sequence (by uri) down to its statement, each level the entry's ordinal
 *  and, below the first, the block of the owner's chunk; the statement's
 *  fingerprint; and the offset in its code. A game writes the addresses of
 *  its executed record so (`durableAddress`) in a save, whose chunk ids a
 *  later compile does not give again (#700). */
interface DurableAddress {
  f?: string;
  d?: string;
  l: [number, number][];
  p: string;
  o: number;
}

/** The durable form of `address` in `root`, as a string, or nothing for an
 *  address the root does not hold. */
export const durableAddress = (
  root: ProgramRoot,
  address: number,
): string | undefined => {
  const at = root.position(chunkOfAddress(address));
  const chunk = at?.sequence.arrays.chunks[at.entry];
  if (!at || !chunk) {
    return undefined;
  }
  const levels: [number, number][] = [];
  let sequence: SequenceRow = at.sequence;
  let entry = at.entry;
  for (;;) {
    levels.unshift([sequence.block, entry]);
    if (sequence.owner < 0) {
      break;
    }
    const owner = root.position(sequence.owner);
    if (!owner) {
      return undefined;
    }
    sequence = owner.sequence;
    entry = owner.entry;
  }
  const form: DurableAddress = {
    l: levels,
    p: fingerprintOf(chunk),
    o: offsetOfAddress(address),
  };
  if (sequence.flow >= 0) {
    form.f = root.table.symbols[sequence.flow]!;
  } else {
    form.d = sequence.uri;
  }
  return JSON.stringify(form);
};

/** The address a durable form names in `root`: the statement at the end of
 *  its chain, when that statement has the fingerprint it had and its code
 *  reaches the offset; otherwise nothing, and nothing is matched
 *  approximately. */
export const placeDurableAddress = (
  root: ProgramRoot,
  saved: string,
): number | undefined => {
  let form: DurableAddress;
  try {
    form = JSON.parse(saved) as DurableAddress;
  } catch {
    return undefined;
  }
  if (!form || !Array.isArray(form.l) || form.l.length === 0) {
    return undefined;
  }
  let sequence: SequenceRow | undefined =
    form.f !== undefined
      ? root.flowNamed(form.f)
      : form.d !== undefined
        ? root.declarations(form.d)
        : undefined;
  let chunk: StatementChunk | undefined;
  for (let i = 0; i < form.l.length; i += 1) {
    const [block, entry] = form.l[i]!;
    if (i > 0) {
      sequence = chunk ? root.body(chunk, block) : undefined;
    }
    chunk = sequence?.arrays.chunks[entry];
    if (!chunk) {
      return undefined;
    }
  }
  if (
    !chunk ||
    fingerprintOf(chunk) !== form.p ||
    !Number.isInteger(form.o) ||
    form.o < 0 ||
    form.o >= codeWords(chunk)
  ) {
    return undefined;
  }
  return addressOf(chunkId(chunk), form.o);
};
