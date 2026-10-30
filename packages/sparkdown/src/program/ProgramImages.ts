import type { ProgramTable } from "./ProgramTable";
import type { InkObject } from "../runtime/Object";
import {
  type AbstractValue,
  ObjectValue,
  VariablePointerValue,
} from "../runtime/Value";
import type { ImageBarrier } from "../runtime/VariablesState";
import type { ProgramRoot } from "./ProgramRoot";
import { countIdOf } from "./ProgramSymbols";
import type {
  PlacedPositional,
  PositionCopy,
  PositionalCopy,
  ProgramStoryState,
} from "./ProgramStoryState";

export class ProgramImages {
  protected _tables = new WeakMap<ObjectValue, TableCopy>();
  protected _tableRefs: WeakRef<ObjectValue>[] = [];
  protected _cells = new WeakMap<VariablePointerValue, CellCopy>();
  protected _cellRefs: WeakRef<VariablePointerValue>[] = [];
  protected _nextId = 0;

  readonly stats = {
    keyframes: 0,
    deltas: 0,
    restores: 0,
    counts: 0,
    globals: 0,
    tables: 0,
    cells: 0,
    pristineTables: 0,
    pristineCells: 0,
    frames: 0,
    outputs: 0,
    wholeRestores: 0,
    restoredKeys: 0,
  };

  protected _identities = new WeakMap<object, number>();
  protected _nextIdentity = 0;

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

  keepTable(table: ObjectValue): void {
    if (!this._tables.has(table)) {
      this._tables.set(table, copyTable(table));
      this._tableRefs.push(new WeakRef(table));
      this.stats.pristineTables += 1;
    }
  }

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

  writtenTables(): ObjectValue[] {
    return live(this._tableRefs);
  }

  writtenCells(): VariablePointerValue[] {
    return live(this._cellRefs);
  }
}

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

export interface TableCopy {
  readonly entries: ReadonlyMap<string, AbstractValue> | null;
  readonly metatable: ObjectValue | null;
  readonly frozen: boolean;
  readonly capacity: number | undefined;
  readonly boundary: number | undefined;
}

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

export interface ProgramImage {
  readonly id: number;
  readonly images: ProgramImages;
  readonly parent: ProgramImage | null;
  readonly keyframe: ProgramImage;
  readonly depth: number;
  readonly reached: WeakSet<object> | null;
  readonly previous: WeakRef<ProgramImage> | null;
  readonly bridge: Keys | null;
  readonly table: ProgramTable;
  readonly generation: number;
  readonly engine: object;
  readonly positional: PositionalCopy;
  readonly visits: Uint32Array | null;
  readonly turns: Int32Array | null;
  readonly countIds: Int32Array | null;
  readonly countVisits: Uint32Array | null;
  readonly countTurns: Int32Array | null;
  readonly globals: ReadonlyMap<string, InkObject | undefined>;
  readonly tables: ReadonlyMap<ObjectValue, TableCopy>;
  readonly cells: ReadonlyMap<VariablePointerValue, CellCopy>;
  beat?: { flags: number; readonly decisions: number[] };
  afterChoice?: { readonly menu: ProgramImage; readonly address: number };
}

export class ImageTracker implements ImageBarrier {
  base: ProgramImage | null = null;
  readonly tables = new Set<ObjectValue>();
  readonly cells = new Set<VariablePointerValue>();
  readonly globals = new Set<string>();
  readonly counts = new Set<number>();

  protected _fresh = new WeakSet<ObjectValue>();

  constructor(readonly images: ProgramImages) {}

  made(table: ObjectValue): void {
    this._fresh.add(table);
  }

  table(table: ObjectValue): void {
    if (!this.isFresh(table)) {
      this.images.keepTable(table);
    }
    this.tables.add(table);
  }

  prepare(table: ObjectValue): void {
    if (!this.isFresh(table)) {
      this.images.keepTable(table);
    }
  }

  isFresh(table: ObjectValue): boolean {
    return this._fresh.has(table);
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

  reset(base: ProgramImage | null): void {
    this.base = base;
    this.tables.clear();
    this.cells.clear();
    this.globals.clear();
    this.counts.clear();
    this._fresh = new WeakSet();
  }
}

export const MAX_DELTA_DEPTH = 64;

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
    const reached = reachedFrom(state, positional);
    const tables = new Map<ObjectValue, TableCopy>();
    for (const table of reached.tables) {
      if (images.pristineTable(table) || tracker.tables.has(table)) {
        tables.set(table, copyTable(table));
      }
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

export const NEVER_VISITED = -0x80000000;

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

export const restoreImage = (
  state: ProgramStoryState,
  tracker: ImageTracker,
  engine: object,
  image: ProgramImage,
  translate?: (image: ProgramImage) => PlacedPositional | undefined,
): boolean => {
  if (image.images !== tracker.images) {
    return false;
  }
  const placed: PlacedPositional | undefined =
    state.placePositional(image.positional) ?? translate?.(image);
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
    restoreKeys(state, images, image, keys);
    state.installPositional(placed);
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
  tracker.reset(
    image.engine === engine && image.generation === root.generation
      ? image
      : null,
  );
  return true;
};

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

const keysBetween = (tracker: ImageTracker, image: ProgramImage): Keys | null => {
  if (!tracker.base) {
    return null;
  }
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

const sameValue = (
  a: InkObject | null | undefined,
  b: InkObject | null | undefined,
  image: ProgramImage,
  chain: readonly ProgramImage[],
): boolean =>
  a === b ||
  new ValueHasher(image.images, image.keyframe.reached, chain).hash(a) ===
    new ValueHasher(image.images, image.keyframe.reached, chain).hash(b);

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

class DigestStream {
  protected _h1 = 0xdeadbeef;
  protected _h2 = 0x41c6ce57;

  add(text: string): void {
    let h1 = Math.imul(this._h1 ^ text.length, 2654435761);
    let h2 = Math.imul(this._h2 ^ text.length, 1597334677);
    for (let i = 0; i < text.length; i += 1) {
      const ch = text.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
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
