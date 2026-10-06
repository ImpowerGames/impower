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
    /** Restores that set every written table and cell and every global,
     *  for an image that shares no keyframe with the state, and the keys
     *  the other restores set. */
    wholeRestores: 0,
    restoredKeys: 0,
  };

  protected _identities = new WeakMap<object, number>();
  protected _nextIdentity = 0;

  /** A number that names a table or a cell for as long as it lives, which
   *  a digest reads it by. */
  identityOf(obj: object): number {
    let id = this._identities.get(obj);
    if (id === undefined) {
      id = this._nextIdentity++;
      this._identities.set(obj, id);
    }
    return id;
  }

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
  /** How many deltas the chain holds from its keyframe to the image. */
  readonly depth: number;
  /** A keyframe's: every table and cell its state reached, which a digest
   *  reads by identity. */
  readonly reached: WeakSet<object> | null;
  /** A keyframe taken on top of an image (a checkpoint's slot, or a chain
   *  that reached `MAX_DELTA_DEPTH`): that image, held weakly, and the keys
   *  written between it and the keyframe, so that a restore of an image
   *  before the keyframe that something still holds costs the changes
   *  along the path between them. */
  readonly previous: WeakRef<ProgramImage> | null;
  readonly bridge: Keys | null;
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

/** The deltas a chain holds at most: the capture after them is a keyframe,
 *  so that restoring an image, and reading its digest, walks no longer a
 *  chain than this however long a game or a search runs on. */
export const MAX_DELTA_DEPTH = 64;

/** Takes an image of `state`: a keyframe when `keyframe` is set, when the
 *  tracker has no base, or when the base's chain holds `MAX_DELTA_DEPTH`
 *  deltas, and otherwise a delta on the base. */
export const captureImage = (
  state: ProgramStoryState,
  tracker: ImageTracker,
  engine: object,
  keyframe = false,
): ProgramImage => {
  const images = tracker.images;
  const stats = images.stats;
  const parent = tracker.base;
  const whole =
    keyframe || parent === null || parent.depth >= MAX_DELTA_DEPTH;
  const positional = state.copyPositional();
  stats.frames += positional.frames;
  stats.outputs += positional.output.length;
  const root = state.root;
  let image: ProgramImage;
  if (whole) {
    const globals = new Map<string, InkObject | undefined>(
      state.variablesState.globalEntries,
    );
    // Every table and cell the state reaches that was ever written: one that
    // was never written holds what it was made with, and one the state does
    // not reach is no part of it, nor of any image taken after it.
    const reached = reachedFrom(state, positional);
    const tables = new Map<ObjectValue, TableCopy>();
    for (const table of reached.tables) {
      if (images.pristineTable(table)) tables.set(table, copyTable(table));
    }
    const cells = new Map<VariablePointerValue, CellCopy>();
    for (const cell of reached.cells) {
      if (images.pristineCell(cell)) cells.set(cell, copyCell(cell));
    }
    const reachedSet = new WeakSet<object>();
    reached.tables.forEach((table) => reachedSet.add(table));
    reached.cells.forEach((cell) => reachedSet.add(cell));
    stats.keyframes += 1;
    stats.counts += state.visits.length;
    stats.globals += globals.size;
    stats.tables += tables.size;
    stats.cells += cells.size;
    const self: { -readonly [K in keyof ProgramImage]: ProgramImage[K] } = {
      id: images.nextId(),
      images,
      // A keyframe holds what it needs, so nothing before it is kept for
      // it: an image a caller let go of is collected.
      parent: null,
      keyframe: null!,
      depth: 0,
      reached: reachedSet,
      previous: parent ? new WeakRef(parent) : null,
      bridge: parent
        ? {
            counts: new Set(tracker.counts),
            globals: new Set(tracker.globals),
            tables: new Set(tracker.tables),
            cells: new Set(tracker.cells),
          }
        : null,
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
      depth: parent!.depth + 1,
      reached: null,
      previous: null,
      bridge: null,
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

/** The tables and cells the state reaches: from its globals, its eval stack
 *  and output, and the temporaries and cells of every frame of every thread
 *  and of every waiting choice's thread, through every table's entries and
 *  metatable and every closed cell's value. */
const reachedFrom = (
  state: ProgramStoryState,
  positional: PositionalCopy,
): { tables: Set<ObjectValue>; cells: Set<VariablePointerValue> } => {
  const tables = new Set<ObjectValue>();
  const cells = new Set<VariablePointerValue>();
  const pending: unknown[] = [];
  const visit = (value: unknown) => {
    if (value instanceof ObjectValue) {
      if (!tables.has(value)) {
        tables.add(value);
        pending.push(value);
      }
    } else if (value instanceof VariablePointerValue) {
      if (!cells.has(value)) {
        cells.add(value);
        if (value.isClosed) visit(value.closedValue);
      }
    } else if (value && Array.isArray((value as { values?: unknown }).values)) {
      for (const inner of (value as { values: unknown[] }).values) visit(inner);
    }
  };
  for (const value of state.variablesState.globalEntries.values()) visit(value);
  positional.evaluationStack.forEach(visit);
  positional.output.forEach(visit);
  positional.carried?.output.forEach(visit);
  const thread = (copy: PositionalCopy["threads"][number]) => {
    for (const element of copy.elements) {
      for (const scope of element.scopes) {
        for (const value of scope.values()) visit(value);
      }
      element.open.forEach(visit);
      element.borrowed.forEach(visit);
    }
  };
  positional.threads.forEach(thread);
  for (const choice of positional.choices) thread(choice.thread);
  while (pending.length > 0) {
    const table = pending.pop() as ObjectValue;
    for (const value of table.value?.values() ?? []) visit(value);
    visit(table.metatable);
  }
  return { tables, cells };
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
  const keys =
    image.engine === engine && image.generation === state.root.generation
      ? keysBetween(tracker, image)
      : null;
  if (keys) {
    // The state and the image descend from one keyframe: only what the
    // images between them wrote and what was marked since goes back, which
    // costs the changes along that path.
    restoreKeys(state, images, image, keys);
    state.installPositional(placed);
    state.ResetCountDeltaTracking();
    tracker.reset(image);
    return true;
  }
  images.stats.wholeRestores += 1;
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
  // An image of this engine and generation is the state's base. One of
  // another engine (whose compiled constants the restore replaced) or of an
  // older table generation (whose count ids it remapped) holds keyed state
  // the state does not, so the next capture is a keyframe.
  tracker.reset(
    image.engine === engine && image.generation === root.generation
      ? image
      : null,
  );
  return true;
};

// The images an image's view of a key is read from: itself first, then each
// image before it back to its keyframe, which holds the counts and globals
// whole.
const viewChain = (image: ProgramImage): ProgramImage[] =>
  chainOf(image).reverse();

const countIn = (chain: readonly ProgramImage[], id: number): [number, number] => {
  for (const at of chain) {
    const i = at.countIds ? at.countIds.indexOf(id) : -1;
    if (i >= 0) {
      return [at.countVisits![i]!, at.countTurns![i]!];
    }
  }
  const keyframe = chain[chain.length - 1]!;
  return [keyframe.visits![id] ?? 0, keyframe.turns![id] ?? NEVER_VISITED];
};

const globalIn = (
  chain: readonly ProgramImage[],
  name: string,
): InkObject | undefined => {
  for (const at of chain) {
    if (at.globals.has(name)) return at.globals.get(name);
  }
  return undefined;
};

// A table's content as the chain holds it, or its pristine copy: a table
// the chain never copied was not written before the image, or was not
// reached by its keyframe's state, and is no part of the image.
const tableIn = (
  chain: readonly ProgramImage[],
  table: ObjectValue,
  images: ProgramImages,
): TableCopy | undefined => {
  for (const at of chain) {
    const copy = at.tables.get(table);
    if (copy) return copy;
  }
  return images.pristineTable(table);
};

const cellIn = (
  chain: readonly ProgramImage[],
  cell: VariablePointerValue,
  images: ProgramImages,
): CellCopy | undefined => {
  for (const at of chain) {
    const copy = at.cells.get(cell);
    if (copy) return copy;
  }
  return images.pristineCell(cell);
};

/** The keys a set of deltas holds. */
interface Keys {
  counts: Set<number>;
  globals: Set<string>;
  tables: Set<ObjectValue>;
  cells: Set<VariablePointerValue>;
}

const keysOf = (deltas: readonly ProgramImage[], into?: Keys): Keys => {
  const keys = into ?? {
    counts: new Set<number>(),
    globals: new Set<string>(),
    tables: new Set<ObjectValue>(),
    cells: new Set<VariablePointerValue>(),
  };
  for (const delta of deltas) {
    delta.countIds?.forEach((id) => keys.counts.add(id));
    for (const name of delta.globals.keys()) keys.globals.add(name);
    for (const table of delta.tables.keys()) keys.tables.add(table);
    for (const cell of delta.cells.keys()) keys.cells.add(cell);
  }
  return keys;
};

/**
 * The keys that can differ between the state, which is the tracker's base
 * with what was marked since, and `image`, when both descend from one
 * keyframe: what the deltas from the base back to the image's chain wrote,
 * what the deltas from there down to the image wrote, and what was marked.
 * Nothing when they do not share a keyframe, which a restore then takes
 * whole.
 */
const keysBetween = (tracker: ImageTracker, image: ProgramImage): Keys | null => {
  if (!tracker.base) {
    return null;
  }
  // Each side's ancestry, up through its deltas, and across each keyframe
  // to the image it was taken on, while something holds it, walked a step
  // at a time on both sides until one reaches an image the other passed,
  // so that the walk costs the path between them.
  const sides = [tracker.base, image].map((start) => ({
    at: start as ProgramImage | null,
    steps: [] as ProgramImage[],
    seen: new Map<ProgramImage, number>(),
  }));
  let meet: { side: number; other: number } | null = null;
  while (!meet && (sides[0]!.at || sides[1]!.at)) {
    for (let s = 0; s < 2 && !meet; s += 1) {
      const side = sides[s]!;
      const at = side.at;
      if (!at) continue;
      const other = sides[1 - s]!.seen.get(at);
      if (other !== undefined) {
        meet = { side: s, other };
        break;
      }
      side.seen.set(at, side.steps.length);
      side.steps.push(at);
      side.at = stepBefore(at);
    }
  }
  if (!meet) {
    return null;
  }
  const keys = keysOf([]);
  const self = sides[meet.side]!.steps;
  const other = sides[1 - meet.side]!.steps.slice(0, meet.other);
  for (const at of [...self, ...other]) {
    addKeys(keys, at.keyframe === at ? at.bridge : keysOf([at]));
  }
  for (const id of tracker.counts) keys.counts.add(id);
  for (const name of tracker.globals) keys.globals.add(name);
  for (const table of tracker.tables) keys.tables.add(table);
  for (const cell of tracker.cells) keys.cells.add(cell);
  return keys;
};

// The image before `image` on its ancestry: a delta's parent, or the image a
// keyframe was taken on while something holds it.
const stepBefore = (image: ProgramImage): ProgramImage | null =>
  image.keyframe === image
    ? image.bridge
      ? (image.previous?.deref() ?? null)
      : null
    : image.parent;

const addKeys = (into: Keys, keys: Keys | null): void => {
  if (!keys) return;
  for (const id of keys.counts) into.counts.add(id);
  for (const name of keys.globals) into.globals.add(name);
  for (const table of keys.tables) into.tables.add(table);
  for (const cell of keys.cells) into.cells.add(cell);
};

// Gives `keys` the values `image` holds for them.
const restoreKeys = (
  state: ProgramStoryState,
  images: ProgramImages,
  image: ProgramImage,
  keys: Keys,
): void => {
  const chain = viewChain(image);
  for (const id of keys.counts) {
    const [visits, turn] = countIn(chain, id);
    state.SetCount(id, visits, turn);
  }
  const variables = state.variablesState;
  for (const name of keys.globals) {
    variables.RestoreGlobal(name, globalIn(chain, name));
  }
  for (const table of keys.tables) {
    const copy = tableIn(chain, table, images);
    if (copy) putTable(table, copy);
  }
  for (const cell of keys.cells) {
    const copy = cellIn(chain, cell, images);
    if (copy) putCell(cell, copy);
  }
  images.stats.restoredKeys +=
    keys.counts.size + keys.globals.size + keys.tables.size + keys.cells.size;
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
 * however each was reached from one keyframe: a route search claims a fork
 * site by it, as it claimed one by the hash of the state's JSON (`planRoute`,
 * `claimForkSite`). It costs what the image's chain changed, not the size of
 * the state: the positional state, and of the keyed state only what differs
 * from the chain's keyframe. A table or a cell the keyframe's state reached
 * is read by its identity, so two arrivals that changed two different tables
 * to the same content read apart, and its content enters the digest only when
 * it changed since the keyframe; one made since is read by its content, as
 * the image holds it, with a second reference to it read as a reference, as
 * the JSON's `objref` did. What it reads is read in an order that does not
 * depend on the order of the writes or of the allocations that made it: the
 * positional state, the changed globals by name, then the changed tables
 * and cells the keyframe reached by identity, each reading the new tables it
 * reaches where it first reaches them.
 */
export const imageDigest = (image: ProgramImage): string => {
  const out = new DigestStream();
  const keyframe = image.keyframe;
  const chain = viewChain(image);
  const values = new ValueHasher(image.images, keyframe.reached, chain);
  out.add(`k${keyframe.id}`);
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
    out.add(choice.text);
    out.add(`${choice.tags?.length ?? -1}`);
    for (const tag of choice.tags ?? []) out.add(tag);
    out.add(`${choice.sourcePath}`);
    out.add(`${choice.isInvisibleDefault}:${choice.previousFlow}`);
    position(choice.target);
    thread(choice.thread);
  }
  // The keyed state the chain changed, where it differs from the
  // keyframe's, each key read once, from the newest image that holds it.
  const keys = keysOf(chainOf(image).slice(1));
  for (const id of [...keys.counts].sort((a, b) => a - b)) {
    const [visits, turn] = countIn(chain, id);
    if (
      visits !== (keyframe.visits![id] ?? 0) ||
      turn !== (keyframe.turns![id] ?? NEVER_VISITED)
    ) {
      out.add(`#${id}:${visits}:${turn}`);
    }
  }
  for (const name of [...keys.globals].sort()) {
    const now = globalIn(chain, name);
    const then = keyframe.globals.get(name);
    if (!sameValue(now, then, image, chain)) {
      out.add(`g${name}=${values.hash(now)}`);
    }
  }
  // The tables and cells the keyframe reached, by identity, which is the
  // same object on every arrival from the keyframe: a table made since is
  // not read here but where the state reaches it, so that neither its
  // identity nor which write reached it first reads.
  const reached = keyframe.reached;
  const byIdentity = <T extends object>(objects: Iterable<T>): T[] =>
    [...objects]
      .filter((obj) => reached?.has(obj))
      .map((obj) => [image.images.identityOf(obj), obj] as const)
      .sort((a, b) => a[0] - b[0])
      .map(([, obj]) => obj);
  for (const table of byIdentity(keys.tables)) {
    const now = tableIn(chain, table, image.images);
    const then = keyframe.tables.get(table) ?? image.images.pristineTable(table);
    if (now && (!then || !sameTable(now, then, image, chain))) {
      out.add(`t${image.images.identityOf(table)}=${values.copy(now)}`);
    }
  }
  for (const cell of byIdentity(keys.cells)) {
    const now = cellIn(chain, cell, image.images);
    const then = keyframe.cells.get(cell) ?? image.images.pristineCell(cell);
    if (
      now &&
      (!then ||
        now.closed !== then.closed ||
        !sameValue(now.value, then.value, image, chain))
    ) {
      out.add(
        `c${image.images.identityOf(cell)}=${now.closed}:${values.hash(now.value)}`,
      );
    }
  }
  return out.digest();
};

// Whether two values are the same: the same object, or two that read the
// same, each read by a hasher of its own so that neither's references
// change how the other reads.
const sameValue = (
  a: InkObject | null | undefined,
  b: InkObject | null | undefined,
  image: ProgramImage,
  chain: readonly ProgramImage[],
): boolean =>
  a === b ||
  new ValueHasher(image.images, image.keyframe.reached, chain).hash(a) ===
    new ValueHasher(image.images, image.keyframe.reached, chain).hash(b);

// Whether two copies of a table hold the same, in the same order: `next`
// and `pairs` read a table's keys in the order they were set, so a key
// removed and set again makes another table.
const sameTable = (
  a: TableCopy,
  b: TableCopy,
  image: ProgramImage,
  chain: readonly ProgramImage[],
): boolean => {
  if (
    a.metatable !== b.metatable ||
    a.frozen !== b.frozen ||
    a.capacity !== b.capacity ||
    a.boundary !== b.boundary ||
    (a.entries?.size ?? -1) !== (b.entries?.size ?? -1)
  ) {
    return false;
  }
  if (!a.entries || !b.entries) {
    return true;
  }
  const other = b.entries.entries();
  for (const [key, value] of a.entries) {
    const [otherKey, otherValue] = other.next().value!;
    if (key !== otherKey || !sameValue(value, otherValue, image, chain)) {
      return false;
    }
  }
  return true;
};

// Hashes values: a table or a cell the keyframe's state reached by its
// identity, and one made since by what it holds as the image's chain holds
// it (a table's content, length hints, frozen flag and metatable, a cell's
// state), each once, with a second reference read as a reference. Every
// value reads as text that ends where it says it ends, so that no two
// values, or lists of values, read as one.
class ValueHasher {
  protected _seen = new Map<object, string>();
  protected _next = 0;

  constructor(
    protected _images: ProgramImages,
    protected _stable: WeakSet<object> | null,
    protected _chain: readonly ProgramImage[],
  ) {}

  hash(obj: InkObject | null | undefined): string {
    if (obj === null || obj === undefined) {
      return "nil";
    }
    if (obj instanceof ObjectValue || obj instanceof VariablePointerValue) {
      if (this._stable?.has(obj)) {
        return `#${this._images.identityOf(obj)}`;
      }
      // The first reference reads as the reference and what it holds, and
      // every later one as the reference, as `objid` and `objref` read in
      // the JSON: one table two variables hold reads apart from two tables
      // that hold the same.
      const seen = this._seen.get(obj);
      if (seen !== undefined) {
        return seen;
      }
      const ref = `@${this._next++}`;
      this._seen.set(obj, ref);
      let hash: string;
      if (obj instanceof ObjectValue) {
        hash = this.copy(
          tableIn(this._chain, obj, this._images) ?? copyTable(obj),
        );
      } else {
        const cell = cellIn(this._chain, obj, this._images) ?? copyCell(obj);
        hash = cell.closed
          ? `C(${this.hash(cell.value)})`
          : `V(${obj.variableName}:${cell.contextIndex}:${cell.scopeIndex})`;
      }
      return `${ref}=${hash}`;
    }
    const multi = obj as { values?: unknown };
    if (Array.isArray(multi.values)) {
      const parts = (multi.values as InkObject[]).map((v) => this.hash(v));
      return `M${parts.length}(${parts.map((h) => `${h.length}:${h}`).join("")})`;
    }
    const text = String(obj);
    return `${obj.constructor.name}:${text.length}:${text}`;
  }

  /** The hash of what a copy of a table holds. */
  copy(copy: TableCopy): string {
    const out = new DigestStream();
    out.add(`T${copy.frozen}:${copy.capacity}:${copy.boundary}`);
    for (const [key, value] of copy.entries ?? []) {
      out.add(key);
      out.add(this.hash(value));
    }
    out.add(`m${this.hash(copy.metatable)}`);
    return out.digest();
  }
}

// Folds strings into a 64-bit hash in two lanes, as `extendSeq` folds a
// route's paths.
class DigestStream {
  protected _h1 = 0xdeadbeef;
  protected _h2 = 0x41c6ce57;

  add(text: string): void {
    // The length first, so that the strings a stream reads are read apart
    // whatever characters they hold.
    let h1 = Math.imul(this._h1 ^ text.length, 2654435761);
    let h2 = Math.imul(this._h2 ^ text.length, 1597334677);
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
