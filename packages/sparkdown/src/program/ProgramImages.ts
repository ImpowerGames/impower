import type { ProgramTable } from "../binary/ProgramBinaryWriter";
import type { InkObject } from "../inkjs/engine/Object";
import {
  type AbstractValue,
  ObjectValue,
  VariablePointerValue,
} from "../inkjs/engine/Value";
import type { ImageBarrier } from "../inkjs/engine/VariablesState";
import type { ProgramRoot } from "./ProgramRoot";
import { countIdOf } from "./ProgramSymbols";
import type {
  PlacedPositional,
  PositionCopy,
  PositionalCopy,
  ProgramStoryState,
} from "./ProgramStoryState";

/**
 * Images of the program engine's state (docs/engine/binary-program.md,
 * section 7, Images). Positional state (the position, the frames, the
 * threads, the eval stack, the output, the choices waiting) is small at the
 * end of a line and an image copies it whole. Keyed state (the counts, the
 * globals, the tables and the closed upvalue cells) is large and changes
 * little: a keyframe copies it whole, and a delta holds what the write
 * barrier marked since the image before it.
 *
 * A table or a cell is copied as it was before its first write, its pristine
 * copy, the first time the barrier hears of it, so that restoring an image
 * taken before that write can put it back. Restoring an image restores in
 * place: each table and cell ever written is given its content as the image
 * has it, from the newest copy on the image's chain back to its keyframe, or
 * from its pristine copy, so identity is kept and nothing is relinked; a
 * table that was never written has held its content since it was made.
 *
 * `ProgramImages` holds the pristine copies and is shared by the engines of
 * one game, one per program, so that an image one engine took restores into
 * the engine built on the next root (`ProgramStory.restore`). The pristine
 * copies are held weakly: a table no image and no engine holds is dropped.
 */
export class ProgramImages {
  protected _tables = new WeakMap<ObjectValue, TableCopy>();
  protected _tableRefs: WeakRef<ObjectValue>[] = [];
  protected _cells = new WeakMap<VariablePointerValue, CellCopy>();
  protected _cellRefs: WeakRef<VariablePointerValue>[] = [];
  protected _nextId = 0;

  /** What the images taken so far copied, which the tests and the bench
   *  read: a fork's image must copy no whole state. */
  readonly stats = {
    keyframes: 0,
    deltas: 0,
    restores: 0,
    /** Count ids an image copied: every one in a keyframe, the changed
     *  ones in a delta. */
    counts: 0,
    /** Globals an image copied. */
    globals: 0,
    /** Tables and cells an image copied, and pristine copies made. */
    tables: 0,
    cells: 0,
    pristineTables: 0,
    pristineCells: 0,
    /** Call frames and output objects a positional copy held. */
    frames: 0,
    outputs: 0,
  };

  nextId(): number {
    return this._nextId++;
  }

  /** Keeps `table`'s pristine copy unless it has one. */
  keepTable(table: ObjectValue): void {
    if (!this._tables.has(table)) {
      this._tables.set(table, copyTable(table));
      this._tableRefs.push(new WeakRef(table));
      this.stats.pristineTables += 1;
    }
  }

  /** Keeps `cell`'s pristine copy unless it has one. */
  keepCell(cell: VariablePointerValue): void {
    if (!this._cells.has(cell)) {
      this._cells.set(cell, copyCell(cell));
      this._cellRefs.push(new WeakRef(cell));
      this.stats.pristineCells += 1;
    }
  }

  pristineTable(table: ObjectValue): TableCopy | undefined {
    return this._tables.get(table);
  }

  pristineCell(cell: VariablePointerValue): CellCopy | undefined {
    return this._cells.get(cell);
  }

  /** Every table ever written that something still holds. */
  writtenTables(): ObjectValue[] {
    return live(this._tableRefs);
  }

  /** Every cell ever written that something still holds. */
  writtenCells(): VariablePointerValue[] {
    return live(this._cellRefs);
  }
}

// The objects a list of weak references still reaches, dropping the rest
// from the list.
const live = <T extends object>(refs: WeakRef<T>[]): T[] => {
  const out: T[] = [];
  let kept = 0;
  for (const ref of refs) {
    const value = ref.deref();
    if (value) {
      out.push(value);
      refs[kept++] = ref;
    }
  }
  refs.length = kept;
  return out;
};

/** A table as an image holds it: its entries, its metatable, its frozen
 *  flag and the two length hints that decide what `#` answers. */
export interface TableCopy {
  readonly entries: ReadonlyMap<string, AbstractValue> | null;
  readonly metatable: ObjectValue | null;
  readonly frozen: boolean;
  readonly capacity: number | undefined;
  readonly boundary: number | undefined;
}

/** An upvalue cell as an image holds it: whether it is closed, the value a
 *  closed cell holds, and the frame and scope an open one reads. */
export interface CellCopy {
  readonly closed: boolean;
  readonly value: InkObject | null;
  readonly contextIndex: number;
  readonly scopeIndex: number;
}

export const copyTable = (table: ObjectValue): TableCopy => {
  const map = table.value as (Map<string, AbstractValue> & Hints) | null;
  return {
    entries: map ? new Map(map) : null,
    metatable: table.metatable,
    frozen: table.isFrozen,
    capacity: map?.__luauCapacity,
    boundary: map?.__luauBoundary,
  };
};

interface Hints {
  __luauCapacity?: number;
  __luauBoundary?: number;
}

/** Gives `table` the content `copy` holds, in place. */
export const putTable = (table: ObjectValue, copy: TableCopy): void => {
  const map = table.value as (Map<string, AbstractValue> & Hints) | null;
  if (map && copy.entries) {
    map.clear();
    for (const [key, value] of copy.entries) {
      map.set(key, value);
    }
    if (copy.capacity === undefined) delete map.__luauCapacity;
    else map.__luauCapacity = copy.capacity;
    if (copy.boundary === undefined) delete map.__luauBoundary;
    else map.__luauBoundary = copy.boundary;
  }
  table.metatable = copy.metatable;
  table.RestoreFrozen(copy.frozen);
};

export const copyCell = (cell: VariablePointerValue): CellCopy => ({
  closed: cell.isClosed,
  value: cell.isClosed ? cell.closedValue : null,
  contextIndex: cell.contextIndex,
  scopeIndex: cell.scopeIndex,
});

export const putCell = (cell: VariablePointerValue, copy: CellCopy): void => {
  if (copy.closed) {
    cell.closedValue = copy.value;
  } else {
    cell.Reopen();
  }
  cell.contextIndex = copy.contextIndex;
  cell.scopeIndex = copy.scopeIndex;
};

/**
 * An image of an engine's state: a keyframe, which holds the keyed state
 * whole, or a delta on the image it follows (`parent`), which holds what was
 * written since. Images form a tree: the images a route search takes at its
 * forks share the image their run started from. An image never changes
 * after it is taken.
 */
export interface ProgramImage {
  readonly id: number;
  readonly images: ProgramImages;
  readonly parent: ProgramImage | null;
  /** The keyframe the image's chain starts at: itself for a keyframe. */
  readonly keyframe: ProgramImage;
  /** The table and generation the count ids are of. */
  readonly table: ProgramTable;
  readonly generation: number;
  /** The engine that took it, whose compiled constants it holds. */
  readonly engine: object;
  readonly positional: PositionalCopy;
  /** A keyframe's counts, whole. */
  readonly visits: Uint32Array | null;
  readonly turns: Int32Array | null;
  /** A delta's changed counts: the ids, and each one's visits and turn. */
  readonly countIds: Int32Array | null;
  readonly countVisits: Uint32Array | null;
  readonly countTurns: Int32Array | null;
  /** The globals: every one in a keyframe, those assigned since the image
   *  before in a delta. */
  readonly globals: ReadonlyMap<string, InkObject | undefined>;
  /** The tables and cells: every one ever written in a keyframe, those
   *  written since the image before in a delta. */
  readonly tables: ReadonlyMap<ObjectValue, TableCopy>;
  readonly cells: ReadonlyMap<VariablePointerValue, CellCopy>;
}

/**
 * What one engine's write barrier marked since its last capture or restore
 * (`base`), which its next capture holds as a delta. A capture with no base
 * (a reset, a load from a save) is a keyframe.
 */
export class ImageTracker implements ImageBarrier {
  base: ProgramImage | null = null;
  readonly tables = new Set<ObjectValue>();
  readonly cells = new Set<VariablePointerValue>();
  readonly globals = new Set<string>();
  readonly counts = new Set<number>();

  constructor(readonly images: ProgramImages) {}

  table(table: ObjectValue): void {
    this.images.keepTable(table);
    this.tables.add(table);
  }

  prepare(table: ObjectValue): void {
    this.images.keepTable(table);
  }

  global(name: string): void {
    this.globals.add(name);
  }

  readonly cell = (cell: VariablePointerValue): void => {
    this.images.keepCell(cell);
    this.cells.add(cell);
  };

  count(id: number): void {
    this.counts.add(id);
  }

  /** Forgets the marks, with `base` as what the state now is. */
  reset(base: ProgramImage | null): void {
    this.base = base;
    this.tables.clear();
    this.cells.clear();
    this.globals.clear();
    this.counts.clear();
  }
}

/** Takes an image of `state`: a keyframe when `keyframe` is set or the
 *  tracker has no base, and otherwise a delta on the base. */
export const captureImage = (
  state: ProgramStoryState,
  tracker: ImageTracker,
  engine: object,
  keyframe = false,
): ProgramImage => {
  const images = tracker.images;
  const stats = images.stats;
  const parent = tracker.base;
  const whole = keyframe || parent === null;
  const positional = state.copyPositional();
  stats.frames += positional.frames;
  stats.outputs += positional.output.length;
  const root = state.root;
  let image: ProgramImage;
  if (whole) {
    const globals = new Map<string, InkObject | undefined>(
      state.variablesState.globalEntries,
    );
    const tables = new Map<ObjectValue, TableCopy>();
    for (const table of images.writtenTables()) {
      tables.set(table, copyTable(table));
    }
    const cells = new Map<VariablePointerValue, CellCopy>();
    for (const cell of images.writtenCells()) {
      cells.set(cell, copyCell(cell));
    }
    stats.keyframes += 1;
    stats.counts += state.visits.length;
    stats.globals += globals.size;
    stats.tables += tables.size;
    stats.cells += cells.size;
    const self: { -readonly [K in keyof ProgramImage]: ProgramImage[K] } = {
      id: images.nextId(),
      images,
      parent,
      keyframe: null!,
      table: root.table,
      generation: root.generation,
      engine,
      positional,
      visits: state.visits.slice(),
      turns: state.turns.slice(),
      countIds: null,
      countVisits: null,
      countTurns: null,
      globals,
      tables,
      cells,
    };
    self.keyframe = self;
    image = self;
  } else {
    const ids = Int32Array.from(tracker.counts);
    const visits = new Uint32Array(ids.length);
    const turns = new Int32Array(ids.length);
    ids.forEach((id, i) => {
      visits[i] = state.visits[id] ?? 0;
      turns[i] = state.turns[id] ?? NEVER_VISITED;
    });
    const live = state.variablesState.globalEntries;
    const globals = new Map<string, InkObject | undefined>();
    for (const name of tracker.globals) {
      globals.set(name, live.get(name));
    }
    const tables = new Map<ObjectValue, TableCopy>();
    for (const table of tracker.tables) {
      tables.set(table, copyTable(table));
    }
    const cells = new Map<VariablePointerValue, CellCopy>();
    for (const cell of tracker.cells) {
      cells.set(cell, copyCell(cell));
    }
    stats.deltas += 1;
    stats.counts += ids.length;
    stats.globals += globals.size;
    stats.tables += tables.size;
    stats.cells += cells.size;
    image = {
      id: images.nextId(),
      images,
      parent,
      keyframe: parent!.keyframe,
      table: root.table,
      generation: root.generation,
      engine,
      positional,
      visits: null,
      turns: null,
      countIds: ids,
      countVisits: visits,
      countTurns: turns,
      globals,
      tables,
      cells,
    };
  }
  tracker.reset(image);
  return image;
};

/** The turn a count id that was never visited holds
 *  (`ProgramStoryState`). */
export const NEVER_VISITED = -0x80000000;

/** The images from `image`'s keyframe to `image`, in the order they were
 *  taken. */
export const chainOf = (image: ProgramImage): ProgramImage[] => {
  const chain: ProgramImage[] = [];
  for (let at: ProgramImage | null = image; at; at = at.parent) {
    chain.push(at);
    if (at === image.keyframe) {
      break;
    }
  }
  return chain.reverse();
};

/** The keyed state an image holds, put together from its chain. */
export interface KeyedState {
  visits: Uint32Array;
  turns: Int32Array;
  globals: Map<string, InkObject>;
  tables: Map<ObjectValue, TableCopy>;
  cells: Map<VariablePointerValue, CellCopy>;
}

export const keyedStateOf = (image: ProgramImage): KeyedState => {
  const chain = chainOf(image);
  const keyframe = chain[0]!;
  let size = keyframe.visits!.length;
  for (const delta of chain) {
    delta.countIds?.forEach((id) => {
      size = Math.max(size, id + 1);
    });
  }
  const visits = new Uint32Array(size);
  visits.set(keyframe.visits!);
  const turns = new Int32Array(size).fill(NEVER_VISITED);
  turns.set(keyframe.turns!);
  const globals = new Map<string, InkObject>();
  const tables = new Map<ObjectValue, TableCopy>();
  const cells = new Map<VariablePointerValue, CellCopy>();
  for (const at of chain) {
    at.countIds?.forEach((id, i) => {
      visits[id] = at.countVisits![i]!;
      turns[id] = at.countTurns![i]!;
    });
    for (const [name, value] of at.globals) {
      if (value === undefined) globals.delete(name);
      else globals.set(name, value);
    }
    for (const [table, copy] of at.tables) tables.set(table, copy);
    for (const [cell, copy] of at.cells) cells.set(cell, copy);
  }
  return { visits, turns, globals, tables, cells };
};

/**
 * Restores `image` into `state` in place, or returns false and changes
 * nothing when a position the image holds cannot be placed in the root
 * `state` runs on: a chunk the root no longer holds, or a sequence it no
 * longer has (docs/engine/binary-program.md, section 8). An image taken in
 * an older table generation has its counts taken through the reseeds since
 * (section 2, Reseed).
 */
export const restoreImage = (
  state: ProgramStoryState,
  tracker: ImageTracker,
  engine: object,
  image: ProgramImage,
): boolean => {
  if (image.images !== tracker.images) {
    return false;
  }
  const placed: PlacedPositional | undefined = state.placePositional(
    image.positional,
  );
  if (!placed) {
    return false;
  }
  const images = tracker.images;
  images.stats.restores += 1;
  const keyed = keyedStateOf(image);
  for (const table of images.writtenTables()) {
    const copy = keyed.tables.get(table) ?? images.pristineTable(table);
    if (copy) putTable(table, copy);
  }
  for (const cell of images.writtenCells()) {
    const copy = keyed.cells.get(cell) ?? images.pristineCell(cell);
    if (copy) putCell(cell, copy);
  }
  const variables = state.variablesState;
  if (image.engine !== engine) {
    // Another program's engine took the image: its compiled constants are
    // this program's, as a load keeps them (`VariablesState.SetJsonToken`).
    for (const name of variables.constantNames) {
      const value = variables.DefaultGlobal(name);
      if (value !== undefined) keyed.globals.set(name, value);
    }
  }
  variables.RestoreGlobals(keyed.globals);
  const root = state.root;
  if (image.generation === root.generation) {
    state.visits = keyed.visits;
    state.turns = keyed.turns;
  } else {
    const counts = remapCounts(keyed, image, root);
    state.visits = counts.visits;
    state.turns = counts.turns;
  }
  state.installPositional(placed);
  state.ResetCountDeltaTracking();
  tracker.reset(image);
  return true;
};

// The counts of an image of another table generation, by the count ids of
// `root`'s: each count id's symbol in the image's table, taken through the
// reseeds since, and that symbol's count id now. A count whose symbol a
// reseed dropped is dropped.
const remapCounts = (
  keyed: KeyedState,
  image: ProgramImage,
  root: ProgramRoot,
): { visits: Uint32Array; turns: Int32Array } => {
  const symbolOf: number[] = [];
  image.table.countIds.forEach((id, symbol) => {
    if (id >= 0) symbolOf[id] = symbol;
  });
  const size = Math.max(root.table.counted, 16);
  const visits = new Uint32Array(size);
  const turns = new Int32Array(size).fill(NEVER_VISITED);
  keyed.visits.forEach((value, id) => {
    const turn = keyed.turns[id]!;
    if (value === 0 && turn === NEVER_VISITED) return;
    const symbol = symbolOf[id];
    const now =
      symbol === undefined ? undefined : root.symbolFrom(symbol, image.generation);
    const to = now === undefined ? -1 : countIdOf(root.table, now);
    if (to >= 0 && to < size) {
      visits[to] = value;
      turns[to] = turn;
    }
  });
  return { visits, turns };
};

/**
 * A digest of the state an image holds, equal for two images of equal states
 * however each was reached: a route search claims a fork site by it, as it
 * claimed one by the hash of the state's JSON (`planRoute`, `claimForkSite`).
 * It costs what the image's chain changed, not the size of the state: the
 * positional state, and of the keyed state only what differs from the
 * chain's keyframe, which the digest names. A table is read by its content,
 * as the JSON did, so two tables made apart that hold the same read the same.
 * The digest reads tables as they stand, so it is taken right after the
 * image is.
 */
export const imageDigest = (image: ProgramImage): string => {
  const out = new DigestStream();
  const values = new ValueHasher();
  out.add(`k${image.keyframe.id}`);
  const p = image.positional;
  const position = (at: PositionCopy | null) =>
    out.add(at ? `${at.chunk}:${at.entry}:${at.offset}:${at.sequence}` : "-");
  const list = (objects: readonly InkObject[]) => {
    out.add(`[${objects.length}`);
    for (const obj of objects) out.add(values.hash(obj));
  };
  const thread = (t: PositionalCopy["threads"][number]) => {
    out.add(`t${t.index}`);
    position(t.resume?.position ?? null);
    out.add(`${t.resume?.previousFlow ?? ""}`);
    for (const e of t.elements) {
      out.add(`e${e.type}:${e.inExpression}:${e.height}:${e.start}`);
      if (e.frame) {
        position(e.frame.returnTo);
        out.add(`f${e.frame.symbol}`);
      }
      for (const scope of e.scopes) {
        out.add(`s${scope.size}`);
        for (const [name, value] of scope) {
          out.add(name);
          out.add(values.hash(value));
        }
      }
      for (const cell of e.open) out.add(`o${values.hash(cell)}`);
      for (const cell of e.borrowed) out.add(`b${values.hash(cell)}`);
    }
  };
  position(p.position);
  list(p.evaluationStack);
  list(p.output);
  out.add(
    `${p.lineEndPending}:${p.lineJoinable}:${p.outputCut}:${p.didSafeExit}:${p.turn}:${p.seed}:${p.previousRandom}:${p.previousFlow}:${p.threadCounter}`,
  );
  if (p.carried) {
    out.add(`c${p.carried.lineEndPending}`);
    list(p.carried.output);
  }
  p.threads.forEach(thread);
  for (const choice of p.choices) {
    out.add(
      `${choice.text}|${choice.tags?.join("|")}|${choice.sourcePath}|${choice.isInvisibleDefault}|${choice.previousFlow}`,
    );
    position(choice.target);
    thread(choice.thread);
  }
  // The keyed state, where it differs from the keyframe's.
  const keyframe = image.keyframe;
  const keyed = keyedStateOf(image);
  const counts = new Set<number>();
  const globals = new Set<string>();
  const tables = new Set<ObjectValue>();
  const cells = new Set<VariablePointerValue>();
  for (const delta of chainOf(image).slice(1)) {
    delta.countIds?.forEach((id) => counts.add(id));
    for (const name of delta.globals.keys()) globals.add(name);
    for (const table of delta.tables.keys()) tables.add(table);
    for (const cell of delta.cells.keys()) cells.add(cell);
  }
  for (const id of [...counts].sort((a, b) => a - b)) {
    const visits = keyed.visits[id] ?? 0;
    const turn = keyed.turns[id] ?? NEVER_VISITED;
    if (
      visits !== (keyframe.visits![id] ?? 0) ||
      turn !== (keyframe.turns![id] ?? NEVER_VISITED)
    ) {
      out.add(`#${id}:${visits}:${turn}`);
    }
  }
  for (const name of [...globals].sort()) {
    const now = keyed.globals.get(name);
    const then = keyframe.globals.get(name);
    if (now !== then && values.hash(now) !== values.hash(then)) {
      out.add(`g${name}=${values.hash(now)}`);
    }
  }
  const changed: string[] = [];
  for (const table of tables) {
    const now = keyed.tables.get(table)!;
    const then = keyframe.tables.get(table) ?? image.images.pristineTable(table);
    if (!then || !sameTable(now, then, values)) {
      changed.push(values.hash(table));
    }
  }
  for (const cell of cells) {
    const now = keyed.cells.get(cell)!;
    const then = keyframe.cells.get(cell) ?? image.images.pristineCell(cell);
    if (
      !then ||
      now.closed !== then.closed ||
      values.hash(now.value) !== values.hash(then.value)
    ) {
      changed.push(`c${values.hash(cell)}`);
    }
  }
  for (const entry of changed.sort()) out.add(entry);
  return out.digest();
};

// Whether two copies of a table hold the same.
const sameTable = (a: TableCopy, b: TableCopy, values: ValueHasher): boolean => {
  if (
    a.metatable !== b.metatable ||
    a.frozen !== b.frozen ||
    a.capacity !== b.capacity ||
    a.boundary !== b.boundary ||
    (a.entries?.size ?? -1) !== (b.entries?.size ?? -1)
  ) {
    return false;
  }
  for (const [key, value] of a.entries ?? []) {
    const other = b.entries!.get(key);
    if (other !== value && values.hash(other) !== values.hash(value)) {
      return false;
    }
  }
  return true;
};

// Hashes values by what they hold: a table by its content, its length hints,
// its frozen flag and its metatable, and a cell by its state, each table and
// cell once, with a cycle read as a back reference.
class ValueHasher {
  protected _seen = new Map<object, string>();
  protected _next = 0;

  hash(obj: InkObject | null | undefined): string {
    if (obj === null || obj === undefined) {
      return "nil";
    }
    if (obj instanceof ObjectValue) {
      const seen = this._seen.get(obj);
      if (seen !== undefined) {
        return seen;
      }
      this._seen.set(obj, `@${this._next++}`);
      const out = new DigestStream();
      const map = obj.value as (Map<string, AbstractValue> & Hints) | null;
      out.add(`T${obj.isFrozen}:${map?.__luauCapacity}:${map?.__luauBoundary}`);
      for (const [key, value] of map ?? []) {
        out.add(key);
        out.add(this.hash(value));
      }
      out.add(`m${this.hash(obj.metatable)}`);
      const hash = out.digest();
      this._seen.set(obj, hash);
      return hash;
    }
    if (obj instanceof VariablePointerValue) {
      const seen = this._seen.get(obj);
      if (seen !== undefined) {
        return seen;
      }
      this._seen.set(obj, `@${this._next++}`);
      const hash = obj.isClosed
        ? `C(${this.hash(obj.closedValue)})`
        : `V(${obj.variableName}:${obj.contextIndex}:${obj.scopeIndex})`;
      this._seen.set(obj, hash);
      return hash;
    }
    const multi = obj as { values?: unknown };
    if (Array.isArray(multi.values)) {
      return `M(${(multi.values as InkObject[]).map((v) => this.hash(v)).join(",")})`;
    }
    return `${obj.constructor.name}:${String(obj)}`;
  }
}

// Folds strings into a 64-bit hash in two lanes, as `extendSeq` folds a
// route's paths.
class DigestStream {
  protected _h1 = 0xdeadbeef;
  protected _h2 = 0x41c6ce57;

  add(text: string): void {
    let h1 = this._h1;
    let h2 = this._h2;
    for (let i = 0; i < text.length; i += 1) {
      const ch = text.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    // A separator, so that two strings do not read as one.
    this._h1 = Math.imul(h1 ^ 0x1f, 2654435761);
    this._h2 = Math.imul(h2 ^ 0x1f, 1597334677);
  }

  digest(): string {
    let h1 = this._h1;
    let h2 = this._h2;
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }
}
