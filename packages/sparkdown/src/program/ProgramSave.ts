import { JsonSerialisation } from "../runtime/JsonSerialisation";
import type { InkObject } from "../runtime/Object";
import { SimpleJson } from "../runtime/SimpleJson";
import {
  BoolValue,
  FloatValue,
  IntValue,
  ObjectValue,
  StringValue,
  SymbolRef,
  SymbolValue,
  VariablePointerValue,
} from "../runtime/Value";
import {
  alignParts,
  chunkPartsOf,
  partOfBlock,
  type ChunkPartKind,
} from "./chunkParts";
import { hash64 } from "./hash64";
import { Op, SET_DECLARE, SET_GLOBAL, SET_VARARGS, flagsOf, opOf } from "./ProgramInstructions";
import { copyCell, putCell, type CellCopy, type ProgramImage } from "./ProgramImages";
import type { ProgramRoot, SequenceRow } from "./ProgramRoot";
import {
  SymbolKind,
  UNDEFINED_KIND,
  countIdOf,
  isAnonymousSymbol,
} from "./ProgramSymbols";
import {
  blockStackOf,
  type PlacedPositional,
  type PlacedThread,
  type PositionCopy,
  type PositionalCopy,
  type ProgramChoice,
  type ProgramPosition,
  type ProgramStoryState,
  type StateCodec,
  type ThreadCopy,
  type ThreadCuts,
} from "./ProgramStoryState";
import {
  BLOCK_FUNCTION,
  BLOCK_LOOP,
  B_BREAK,
  B_RESUME,
  H_FINGERPRINT,
  H_LAYOUT_HASH,
  HEADER_WORDS,
  addressOf,
  blockCount,
  blockField,
  blockFlags,
  chunkId,
  chunkOfAddress,
  codeWords,
  offsetOfAddress,
  type ProgramChunk,
} from "./ProgramChunk";

export const SAVE_FORMAT = 2;

export const PROGRAM_ENGINE_VERSION = "2";

export const BEAT_WAITED = 1;
export const BEAT_REWIND_FLOOR = 2;
export const BEAT_DECISIONS_FIXED = 4;

export interface BeatRecord {
  readonly image: ProgramImage;
  flags: number;
  readonly decisions: number[];
  root?: ProgramRoot;
}

export interface SaveHeader {
  format: number;
  engine: string;
  engineVersion: string;
  gameVersion: string;
}

export interface SaveReport {
  beat: number;
  beats: number;
  exact: boolean;
  warnings: string[];
  chosen: "taken" | "unplaced" | null;
}

export class SaveRefused extends Error {
  constructor(
    message: string,
    readonly flow: string | null = null,
  ) {
    super(message);
    this.name = "SaveRefused";
  }
}

const MIGRATIONS: Record<number, (save: Record<string, any>) => Record<string, any>> = {
  1: (save) => {
    const { engine, format, engineVersion, gameVersion, listings, ...state } = save;
    void format;
    return {
      engine,
      format: 2,
      engineVersion,
      gameVersion,
      beats: [{ ...state, flags: BEAT_WAITED, decisions: [] }],
      listings,
      parts: [],
    };
  },
};

const hex = (chunk: ProgramChunk, at: number): string =>
  (chunk[at]! >>> 0).toString(16).padStart(8, "0") +
  (chunk[at + 1]! >>> 0).toString(16).padStart(8, "0");

const fingerprints = new WeakMap<ProgramChunk, string>();

export const fingerprintOf = (chunk: ProgramChunk): string => {
  let print = fingerprints.get(chunk);
  if (print === undefined) {
    print = hex(chunk, H_FINGERPRINT);
    fingerprints.set(chunk, print);
  }
  return print;
};

export const layoutOf = (chunk: ProgramChunk): string =>
  hex(chunk, H_LAYOUT_HASH);

const partPrint = (fingerprint: string): string =>
  hash64(fingerprint)
    .map((word) => (word >>> 0).toString(16).padStart(8, "0"))
    .join("");

const partPrints = (chunk: ProgramChunk, kind: ChunkPartKind): string[] =>
  (chunkPartsOf(chunk)?.[kind] ?? []).map((part) => partPrint(part.fingerprint));

interface SavedLevel {
  s: number;
  at: number;
  flow?: string;
  decl?: string;
  p?: number;
  k?: ChunkPartKind;
  i?: number;
  block?: number;
  loop?: string;
  params?: string[];
  scene?: string[];
}

interface SavedStatement {
  levels: SavedLevel[];
}

type PartRef = [number, ChunkPartKind, number];

type SavedAnchor =
  | "start"
  | "end"
  | "done"
  | [number, string]
  | { after: PartRef }
  | { brk: PartRef }
  | { ch: PartRef };

interface SavedPosition {
  st: SavedStatement;
  a: SavedAnchor;
}

type SavedSymbol =
  | { n: string }
  | { gone: string }
  | { st: SavedStatement; k: ChunkPartKind; i: number; pl?: number; p?: string };

interface SavedListing {
  n: number;
  windows: (number | string)[][];
}

interface SavedParts {
  k: ChunkPartKind;
  l: string[];
}

const WHOLE_LISTING = 512;
const WINDOW_SIDE = 256;

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

const declaresGlobal = (chunk: ProgramChunk): boolean => {
  for (let at = 0; at < codeWords(chunk); at += 2) {
    const w0 = chunk[HEADER_WORDS + at]!;
    if (opOf(w0) === Op.SetVar && (flagsOf(w0) & (SET_DECLARE | SET_GLOBAL)) === (SET_DECLARE | SET_GLOBAL)) {
      return true;
    }
  }
  return false;
};

const roleView = (
  declarations: SequenceRow,
  writes: boolean,
): { view: SequenceRow; entries: number[] } => {
  const entries: number[] = [];
  declarations.arrays.chunks.forEach((chunk, entry) => {
    if (declaresGlobal(chunk) !== writes) {
      entries.push(entry);
    }
  });
  return {
    view: {
      ...declarations,
      id: (writes ? -1 : -2) - 2 * declarations.id,
      arrays: {
        chunks: entries.map((entry) => declarations.arrays.chunks[entry]!),
        lineStarts: entries.map((entry) => declarations.arrays.lineStarts[entry]!),
      },
    },
    entries,
  };
};

const writesName = (uri: string): string =>
  `${SAVED_INCLUDED_FLOW_PREFIX}${uri.replace(/\./g, "%2E")}`;

const choiceInstructions = (
  chunk: ProgramChunk,
): { at: number; entry: number }[] => {
  const out: { at: number; entry: number }[] = [];
  for (let at = 0; at < codeWords(chunk); at += 2) {
    if (opOf(chunk[HEADER_WORDS + at]!) === Op.Choice) {
      out.push({ at, entry: at + 2 + chunk[HEADER_WORDS + at + 1]! });
    }
  }
  return out;
};

const bindingLayout = (root: ProgramRoot, symbol: number): string | undefined => {
  const kind = root.kindOf(symbol);
  if (kind === SymbolKind.Function) {
    const place = root.place(symbol);
    const chunk = place?.sequence.arrays.chunks[place.entry];
    return chunk ? layoutOf(chunk) : undefined;
  }
  if (kind === SymbolKind.Scene || kind === SymbolKind.Branch) {
    const flow = root.flow(symbol);
    if (!flow) {
      return undefined;
    }
    const entry = flow.arrays.chunks[0];
    return entry && flow.arrays.lineStarts[0] === -1 ? layoutOf(entry) : "none";
  }
  return undefined;
};

const bindingFlowOf = (root: ProgramRoot, sequence: SequenceRow): number | undefined => {
  const kind = sequence.flow >= 0 ? root.kindOf(sequence.flow) : undefined;
  if (kind !== SymbolKind.Scene && kind !== SymbolKind.Branch) {
    return undefined;
  }
  const blocks = blockStackOf(root, sequence);
  const outer = blocks?.[0];
  if (
    !blocks ||
    (outer && blockFlags(outer.sequence.arrays.chunks[outer.entry]!, outer.block) & BLOCK_FUNCTION)
  ) {
    return undefined;
  }
  return sequence.flow;
};

const entryParameters = (
  root: ProgramRoot,
  flow: SequenceRow,
): { name: string; vararg: boolean }[] => {
  const entry = flow.arrays.chunks[0];
  const out: { name: string; vararg: boolean }[] = [];
  if (!entry || flow.arrays.lineStarts[0] !== -1) {
    return out;
  }
  for (let at = 0; at < codeWords(entry); at += 2) {
    const w0 = entry[HEADER_WORDS + at]!;
    if (opOf(w0) !== Op.SetVar) {
      break;
    }
    out.unshift({
      name: root.table.strings[entry[HEADER_WORDS + at + 1]!]!,
      vararg: (flagsOf(w0) & SET_VARARGS) !== 0,
    });
  }
  return out;
};

type FlowRestart = NonNullable<ThreadCuts["restart"]>;

const entryBinding = (root: ProgramRoot, symbol: number): string[] | undefined => {
  const kind = root.kindOf(symbol);
  const flow =
    kind === SymbolKind.Scene || kind === SymbolKind.Branch ? root.flow(symbol) : undefined;
  return flow ? entryParameters(root, flow).map((param) => param.name) : undefined;
};

const sceneOfBranch = (root: ProgramRoot, symbol: number): number => {
  if (root.kindOf(symbol) !== SymbolKind.Branch) {
    return -1;
  }
  const scene = root.parentOf(symbol);
  return scene >= 0 && root.kindOf(scene) === SymbolKind.Scene ? scene : -1;
};

const positionBindings = (
  root: ProgramRoot,
  sequence: SequenceRow,
): { params?: string[]; scene?: string[] } => {
  const symbol = bindingFlowOf(root, sequence);
  const own = symbol !== undefined ? entryBinding(root, symbol) : undefined;
  if (symbol === undefined || !own) {
    return {};
  }
  const scene = sceneOfBranch(root, symbol);
  const outer = scene >= 0 ? entryBinding(root, scene) : undefined;
  return outer ? { params: own, scene: outer } : { params: own };
};

const restartPosition = (
  root: ProgramRoot,
  symbol: number,
  flow: SequenceRow,
  bindings: number,
): ProgramPosition => {
  const chunks = flow.arrays.chunks;
  if (chunks.length === 0) {
    const start = root.startOf(symbol);
    const branch = start >= 0 ? root.place(start) : undefined;
    return branch ?? { sequence: flow, entry: 0, offset: 0 };
  }
  const entry = chunks[0]!;
  return bindings > 0 && bindings * 2 >= codeWords(entry)
    ? { sequence: flow, entry: 1, offset: 0 }
    : { sequence: flow, entry: 0, offset: bindings * 2 };
};

const restartOf = (
  root: ProgramRoot,
  symbol: number,
  saved: unknown,
  names: ReadonlySet<string> | undefined,
): FlowRestart | undefined => {
  if (!Array.isArray(saved) || saved.length === 0) {
    return undefined;
  }
  const savedNames = saved.map(String);
  if (names && savedNames.some((name) => !names.has(name))) {
    return undefined;
  }
  const flow = root.flow(symbol);
  if (!flow) {
    return undefined;
  }
  const params = entryParameters(root, flow);
  if (
    params.length === savedNames.length &&
    params.every((param, i) => param.name === savedNames[i])
  ) {
    return undefined;
  }
  return {
    flow: root.table.symbols[symbol]!,
    position: restartPosition(root, symbol, flow, params.length),
    params,
    saved: savedNames,
  };
};

const flowRestart = (
  root: ProgramRoot,
  level: Pick<SavedLevel, "params" | "scene"> | undefined,
  sequence: SequenceRow,
  scopes?: readonly (readonly string[])[],
): FlowRestart | undefined => {
  const symbol = bindingFlowOf(root, sequence);
  if (symbol === undefined) {
    return undefined;
  }
  const scene = sceneOfBranch(root, symbol);
  const boundIn = (index: number): ReadonlySet<string> | undefined =>
    scopes && scopes.length > 0
      ? new Set([...(scopes[0] ?? []), ...(scopes[index] ?? [])])
      : undefined;
  return (
    (scene >= 0 ? restartOf(root, scene, level?.scene, boundIn(1)) : undefined) ??
    restartOf(root, symbol, level?.params, boundIn(scene >= 0 ? 2 : 1))
  );
};

const savedScopeNames = (frame: Record<string, any> | undefined): string[][] | undefined => {
  const scopes: unknown[] = Array.isArray(frame?.["temps"]) ? frame["temps"] : [];
  const held = scopes.filter((scope): scope is object => !!scope && typeof scope === "object");
  return held.length > 0 ? held.map((scope) => Object.keys(scope)) : undefined;
};

const choicesByPart = (
  chunk: ProgramChunk,
): { at: number; entry: number }[] | undefined => {
  const parts = chunkPartsOf(chunk)?.choices;
  const choices = choiceInstructions(chunk);
  return parts && parts.length === choices.length ? choices : undefined;
};

class FormWriter {
  protected _listings = new Map<number, { index: number; sequence: SequenceRow; ranges: [number, number][] }>();
  protected _parts = new Map<ProgramChunk, Map<ChunkPartKind, number>>();
  protected _partList: SavedParts[] = [];
  protected _owners: Map<number, { chunk: ProgramChunk; kind: ChunkPartKind; index: number }> | null =
    null;

  constructor(readonly root: ProgramRoot) {}

  listings(): SavedListing[] {
    return [...this._listings.values()]
      .sort((a, b) => a.index - b.index)
      .map((listing) => {
        const chunks = listing.sequence.arrays.chunks;
        return {
          n: chunks.length,
          windows: merged(listing.ranges).map(([from, to]) => [
            from,
            ...chunks.slice(from, to).map(fingerprintOf),
          ]),
        };
      });
  }

  parts(): SavedParts[] {
    return this._partList;
  }

  protected partList(chunk: ProgramChunk, kind: ChunkPartKind): number {
    let kinds = this._parts.get(chunk);
    if (!kinds) {
      kinds = new Map();
      this._parts.set(chunk, kinds);
    }
    let index = kinds.get(kind);
    if (index === undefined) {
      index = this._partList.length;
      this._partList.push({ k: kind, l: partPrints(chunk, kind) });
      kinds.set(kind, index);
    }
    return index;
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

  statementForm(sequence: SequenceRow, entry: number): SavedStatement {
    const root = this.root;
    const levels: SavedLevel[] = [];
    let at = sequence;
    let e = entry;
    for (;;) {
      if (at.owner < 0 && at.flow < 0) {
        const writes = !declaresGlobal(at.arrays.chunks[e]!);
        const role = roleView(at, writes);
        const r = role.entries.indexOf(e);
        levels.unshift({
          s: this.listing(role.view, r),
          at: r,
          ...(writes ? { flow: writesName(at.uri) } : { decl: at.uri }),
        });
        break;
      }
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
      const part = partOfBlock(ownerChunk, at.block);
      if (part) {
        level.p = this.partList(ownerChunk, part.kind);
        level.k = part.kind;
        level.i = part.index;
      } else {
        level.block = at.block;
      }
      if (blockFlags(ownerChunk, at.block) & BLOCK_LOOP) {
        level.loop = layoutOf(ownerChunk);
      }
      levels.unshift(level);
      at = owner.sequence;
      e = owner.entry;
    }
    return { levels };
  }

  protected anchorOf(chunk: ProgramChunk, offset: number): SavedAnchor {
    if (offset === 0) {
      return "start";
    }
    if (offset >= codeWords(chunk)) {
      return "done";
    }
    for (let k = 0; k < blockCount(chunk); k += 1) {
      const resume = blockField(chunk, k, B_RESUME);
      const brk = blockField(chunk, k, B_BREAK);
      if (offset !== resume && offset !== brk) {
        continue;
      }
      const part = partOfBlock(chunk, k);
      if (part) {
        const ref: PartRef = [this.partList(chunk, part.kind), part.kind, part.index];
        return offset === resume ? { after: ref } : { brk: ref };
      }
    }
    const choices = choicesByPart(chunk);
    const choice = choices?.findIndex((c) => c.entry === offset) ?? -1;
    if (choice >= 0) {
      return { ch: [this.partList(chunk, "choices"), "choices", choice] };
    }
    return [offset, layoutOf(chunk)];
  }

  positionForm(position: ProgramPosition): SavedPosition {
    const { sequence, entry, offset } = position;
    const chunk = sequence.arrays.chunks[entry];
    const st = this.statementForm(sequence, entry);
    const level = st.levels[0]!;
    if (level.flow !== undefined) {
      Object.assign(level, positionBindings(this.root, sequence));
    }
    return {
      st,
      a: chunk ? this.anchorOf(chunk, offset) : "end",
    };
  }

  choiceForm(address: number): SavedPosition | undefined {
    const at = this.root.position(chunkOfAddress(address));
    const chunk = at?.sequence.arrays.chunks[at.entry];
    if (!at || !chunk) {
      return undefined;
    }
    const choices = choicesByPart(chunk);
    const index = choices?.findIndex((c) => c.at === offsetOfAddress(address)) ?? -1;
    if (index < 0) {
      return undefined;
    }
    return {
      st: this.statementForm(at.sequence, at.entry),
      a: { ch: [this.partList(chunk, "choices"), "choices", index] },
    };
  }

  symbolForm(symbol: number, label: string): SavedSymbol {
    const table = this.root.table;
    if (!isAnonymousSymbol(table, symbol)) {
      return { n: table.symbols[symbol]! };
    }
    const owner = this.owners().get(symbol);
    const at = owner ? this.root.position(chunkId(owner.chunk)) : undefined;
    if (!owner || !at) {
      throw new Error(`The anonymous symbol of ${label} has no statement in its program.`);
    }
    return {
      st: this.statementForm(at.sequence, at.entry),
      k: owner.kind,
      i: owner.index,
      pl: this.partList(owner.chunk, owner.kind),
    };
  }

  protected owners() {
    if (!this._owners) {
      const owners = new Map<number, { chunk: ProgramChunk; kind: ChunkPartKind; index: number }>();
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
}

interface StatementPlacement {
  sequence: SequenceRow;
  entry: number;
  how: "exact" | "edited";
  moved: boolean;
}

interface Placed {
  position: ProgramPosition;
  after: boolean;
  statement: { sequence: SequenceRow; entry: number };
}

const SEARCH_SIDE = 8;
const SEARCH_NEIGHBOURS = 2;

const SAVED_INCLUDED_FLOW_PREFIX = "$include:";

const longestMatch = (
  a: readonly string[],
  b2j: ReadonlyMap<string, readonly number[]>,
  alo: number,
  ahi: number,
  blo: number,
  bhi: number,
): [number, number, number] => {
  let besti = alo;
  let bestj = blo;
  let bestsize = 0;
  let j2len = new Map<number, number>();
  for (let i = alo; i < ahi; i += 1) {
    const next = new Map<number, number>();
    for (const j of b2j.get(a[i]!) ?? []) {
      if (j < blo) continue;
      if (j >= bhi) break;
      const k = (j2len.get(j - 1) ?? 0) + 1;
      next.set(j, k);
      if (k > bestsize) {
        besti = i - k + 1;
        bestj = j - k + 1;
        bestsize = k;
      }
    }
    j2len = next;
  }
  return [besti, bestj, bestsize];
};

const matchingBlocks = (
  a: readonly string[],
  b: readonly string[],
  b2j: ReadonlyMap<string, readonly number[]>,
): [number, number, number][] => {
  const queue: [number, number, number, number][] = [[0, a.length, 0, b.length]];
  const blocks: [number, number, number][] = [];
  while (queue.length > 0) {
    const [alo, ahi, blo, bhi] = queue.pop()!;
    const [i, j, k] = longestMatch(a, b2j, alo, ahi, blo, bhi);
    if (k > 0) {
      blocks.push([i, j, k]);
      if (alo < i && blo < j) queue.push([alo, i, blo, j]);
      if (i + k < ahi && j + k < bhi) queue.push([i + k, ahi, j + k, bhi]);
    }
  }
  return blocks.sort((x, y) => x[0] - y[0]);
};

const PRINTS = new WeakMap<object, string[]>();
const B2J = new WeakMap<object, Map<string, number[]>>();
const INDEXES = new WeakMap<ProgramRoot, Map<string, { sequence: SequenceRow; entry: number }[]>>();

class FormPlacer {
  readonly warnings: string[] = [];
  protected _moves = new Map<string, string>();
  protected _renames: [string, string][] = [];
  protected _blocks = new Map<string, [number, number, number][]>();
  protected _roles = new Map<string, { view: SequenceRow; entries: number[] }>();
  protected _roleOf = new Map<SequenceRow, { real: SequenceRow; entries: number[] }>();
  protected _roleIndexes = new Map<boolean, Map<string, { sequence: SequenceRow; entry: number }[]>>();

  constructor(
    readonly root: ProgramRoot,
    protected _listings: readonly SavedListing[],
    protected _parts: readonly SavedParts[],
  ) {}

  protected printsOf(sequence: SequenceRow): string[] {
    let prints = PRINTS.get(sequence.arrays);
    if (!prints) {
      prints = sequence.arrays.chunks.map(fingerprintOf);
      PRINTS.set(sequence.arrays, prints);
    }
    return prints;
  }

  protected b2jOf(sequence: SequenceRow): Map<string, number[]> {
    let b2j = B2J.get(sequence.arrays);
    if (!b2j) {
      b2j = new Map();
      this.printsOf(sequence).forEach((print, j) => {
        let list = b2j!.get(print);
        if (!list) {
          list = [];
          b2j!.set(print, list);
        }
        list.push(j);
      });
      B2J.set(sequence.arrays, b2j);
    }
    return b2j;
  }

  protected index(): Map<string, { sequence: SequenceRow; entry: number }[]> {
    let index = INDEXES.get(this.root);
    if (!index) {
      index = new Map();
      for (const sequence of this.root.sequences()) {
        const declarations = sequence.flow < 0 && sequence.owner < 0;
        this.printsOf(sequence).forEach((print, entry) => {
          if (declarations && !declaresGlobal(sequence.arrays.chunks[entry]!)) {
            return;
          }
          let list = index!.get(print);
          if (!list) {
            list = [];
            index!.set(print, list);
          }
          list.push({ sequence, entry });
        });
      }
      INDEXES.set(this.root, index);
    }
    return index;
  }

  protected roleIndex(writes: boolean): Map<string, { sequence: SequenceRow; entry: number }[]> {
    let index = this._roleIndexes.get(writes);
    if (!index) {
      index = new Map<string, { sequence: SequenceRow; entry: number }[]>();
      for (const declarations of this.root.sequences()) {
        if (declarations.flow >= 0 || declarations.owner >= 0) {
          continue;
        }
        const sequence = this.roleOf(declarations, writes);
        this.printsOf(sequence).forEach((print, entry) => {
          let list = index!.get(print);
          if (!list) {
            list = [];
            index!.set(print, list);
          }
          list.push({ sequence, entry });
        });
      }
      this._roleIndexes.set(writes, index);
    }
    return index;
  }

  protected windowOf(
    s: number,
    at: number,
  ): { from: number; prints: string[]; whole: boolean; n: number } | undefined {
    const listing = this._listings[s];
    if (!listing) {
      return undefined;
    }
    for (const window of listing.windows ?? []) {
      const from = Number(window[0]);
      const prints = window.slice(1).map(String);
      if (at >= from && at < from + prints.length) {
        return { from, prints, whole: from === 0 && prints.length === listing.n, n: listing.n };
      }
    }
    return undefined;
  }

  renamed(name: string): string {
    for (const [from, to] of this._renames) {
      if (name === from) return to;
      if (name.startsWith(`${from}.`)) return to + name.slice(from.length);
    }
    return name;
  }

  protected names(name: string): boolean {
    const symbol = this.root.table.symbolIds.get(name);
    return symbol !== undefined && this.root.kindOf(symbol) !== UNDEFINED_KIND;
  }

  settleRenames(): void {
    const renames = new Map<string, string>();
    for (const [old, now] of this._moves) {
      const a = old.split(".");
      const b = now.split(".");
      while (a.length > 0 && b.length > 0 && a[a.length - 1] === b[b.length - 1]) {
        a.pop();
        b.pop();
      }
      const from = a.join(".");
      const to = b.join(".");
      if (from && to && !this.names(from) && this.names(to)) {
        renames.set(from, to);
      } else if (!this.names(old) && this.names(now)) {
        renames.set(old, now);
      }
    }
    this._renames = [...renames].sort((x, y) => y[0].length - x[0].length);
  }

  get renames(): readonly [string, string][] {
    return this._renames;
  }

  protected topOf(level: SavedLevel): SequenceRow | undefined {
    if (level.flow !== undefined) {
      const flow = this.root.flowNamed(this.renamed(level.flow));
      if (!flow && level.flow.startsWith(SAVED_INCLUDED_FLOW_PREFIX)) {
        const declarations = this.root.declarations(
          level.flow.slice(SAVED_INCLUDED_FLOW_PREFIX.length).replace(/%2E/g, "."),
        );
        return declarations ? this.roleOf(declarations, true) : undefined;
      }
      return flow;
    }
    if (level.decl === undefined) {
      return undefined;
    }
    const declarations = this.root.declarations(level.decl);
    return declarations ? this.roleOf(declarations, false) : undefined;
  }

  protected roleOf(declarations: SequenceRow, writes: boolean): SequenceRow {
    const key = `${declarations.id}:${writes}`;
    let role = this._roles.get(key);
    if (!role || this._roleOf.get(role.view)?.real !== declarations) {
      role = roleView(declarations, writes);
      this._roles.set(key, role);
      this._roleOf.set(role.view, { real: declarations, entries: role.entries });
    }
    return role.view;
  }

  protected flowNameOf(sequence: SequenceRow): string | undefined {
    return sequence.flow >= 0 ? this.root.table.symbols[sequence.flow] : undefined;
  }

  protected bodyOf(owner: StatementPlacement, level: SavedLevel): SequenceRow | undefined {
    const chunk = owner.sequence.arrays.chunks[owner.entry];
    if (!chunk) {
      return undefined;
    }
    if (level.p !== undefined && level.k !== undefined && level.i !== undefined) {
      const saved = this._parts[level.p];
      const now = chunkPartsOf(chunk)?.[level.k];
      if (!saved || !now) {
        return undefined;
      }
      const { pairs } = alignParts(now.map((part) => partPrint(part.fingerprint)), saved.l);
      const j = pairs.indexOf(level.i);
      const block = j >= 0 ? now[j]!.block : -1;
      return block >= 0 ? this.root.body(chunk, block) : undefined;
    }
    if (level.block !== undefined && level.block < blockCount(chunk)) {
      return this.root.body(chunk, level.block);
    }
    return undefined;
  }

  placeLevels(levels: readonly SavedLevel[]): (StatementPlacement | undefined)[] {
    const out: (StatementPlacement | undefined)[] = [];
    levels.forEach((level, i) => {
      let sequence: SequenceRow | undefined;
      if (i === 0) {
        sequence = this.topOf(level);
      } else {
        const owner = out[i - 1];
        sequence = owner ? this.bodyOf(owner, level) : undefined;
      }
      let placed = this.placeIn(sequence, level);
      const role = placed ? this._roleOf.get(placed.sequence) : undefined;
      if (placed && role) {
        placed = {
          ...placed,
          sequence: role.real,
          entry: role.entries[placed.entry] ?? role.real.arrays.chunks.length,
        };
      }
      if (placed?.moved && levels[0]?.flow !== undefined) {
        const now = this.flowNameOf(placed.sequence);
        const old = levels[0].flow;
        if (now !== undefined && now !== old && !this._moves.has(old)) {
          this._moves.set(old, now);
        }
      }
      out.push(placed);
    });
    return out;
  }

  protected placeIn(
    sequence: SequenceRow | undefined,
    level: SavedLevel,
  ): StatementPlacement | undefined {
    const listing = this._listings[level.s];
    if (!listing) {
      return undefined;
    }
    if (level.at >= listing.n) {
      if (sequence) {
        return { sequence, entry: sequence.arrays.chunks.length, how: "exact", moved: false };
      }
      if (listing.n === 0) {
        return undefined;
      }
      const last = this.placeIn(undefined, { ...level, at: listing.n - 1 });
      return last
        ? { ...last, entry: last.sequence.arrays.chunks.length }
        : undefined;
    }
    const window = this.windowOf(level.s, level.at);
    if (!window) {
      return undefined;
    }
    const wi = level.at - window.from;
    if (sequence) {
      const blocks = this.blocksOf(sequence, level.s, window);
      for (const [i, j, k] of blocks) {
        if (wi >= i && wi < i + k) {
          return { sequence, entry: j + wi - i, how: "exact", moved: false };
        }
      }
    }
    const found = this.search(
      window.prints,
      wi,
      level.flow?.startsWith(SAVED_INCLUDED_FLOW_PREFIX) === true
        ? true
        : level.decl !== undefined
          ? false
          : undefined,
    );
    if (found) {
      return {
        sequence: found.sequence,
        entry: found.entry,
        how: "exact",
        moved: found.sequence !== sequence,
      };
    }
    if (sequence) {
      const paired = this.pair(sequence, level.s, window, wi);
      if (paired !== undefined) {
        return { sequence, entry: paired, how: "edited", moved: false };
      }
    }
    return undefined;
  }

  protected blocksOf(
    sequence: SequenceRow,
    s: number,
    window: { from: number; prints: string[] },
  ): [number, number, number][] {
    const key = `${sequence.id}:${s}:${window.from}`;
    let blocks = this._blocks.get(key);
    if (!blocks) {
      blocks = matchingBlocks(window.prints, this.printsOf(sequence), this.b2jOf(sequence));
      this._blocks.set(key, blocks);
    }
    return blocks;
  }

  protected search(
    prints: readonly string[],
    wi: number,
    writes?: boolean,
  ): { sequence: SequenceRow; entry: number } | undefined {
    const candidates =
      (writes === undefined ? this.index() : this.roleIndex(writes)).get(prints[wi]!) ?? [];
    let best = 0;
    let found: { sequence: SequenceRow; entry: number }[] = [];
    for (const candidate of candidates) {
      const now = this.printsOf(candidate.sequence);
      let left = 0;
      while (
        left < SEARCH_SIDE &&
        wi - left - 1 >= 0 &&
        candidate.entry - left - 1 >= 0 &&
        prints[wi - left - 1] === now[candidate.entry - left - 1]
      ) {
        left += 1;
      }
      let right = 0;
      while (
        right < SEARCH_SIDE &&
        wi + right + 1 < prints.length &&
        candidate.entry + right + 1 < now.length &&
        prints[wi + right + 1] === now[candidate.entry + right + 1]
      ) {
        right += 1;
      }
      const whole =
        prints.length < SEARCH_NEIGHBOURS + 1 &&
        left === wi &&
        right === prints.length - 1 - wi;
      if (left + right < SEARCH_NEIGHBOURS && !whole) {
        continue;
      }
      const run = left + right + 1;
      if (run > best) {
        best = run;
        found = [candidate];
      } else if (run === best) {
        found.push(candidate);
      }
    }
    return found.length === 1 ? found[0] : undefined;
  }

  protected pair(
    sequence: SequenceRow,
    s: number,
    window: { from: number; prints: string[]; n: number },
    wi: number,
  ): number | undefined {
    const blocks = this.blocksOf(sequence, s, window);
    const length = sequence.arrays.chunks.length;
    let a0 = 0;
    let b0: number | undefined = window.from === 0 ? 0 : undefined;
    let a1 = window.prints.length;
    let b1: number | undefined =
      window.from + window.prints.length === window.n ? length : undefined;
    for (const [i, j, k] of blocks) {
      if (i + k <= wi) {
        a0 = i + k;
        b0 = j + k;
      } else if (i > wi) {
        a1 = i;
        b1 = j;
        break;
      }
    }
    if (b0 === undefined || b1 === undefined) {
      return undefined;
    }
    const entry = b0 + (wi - a0);
    return entry < b1 && wi < a1 ? entry : undefined;
  }

  placeStatement(
    st: SavedStatement,
  ): { placed: StatementPlacement; levels: (StatementPlacement | undefined)[] } | undefined {
    const levels = Array.isArray(st?.levels) ? st.levels : [];
    if (levels.length === 0) {
      return undefined;
    }
    const placed = this.placeLevels(levels);
    const last = placed[placed.length - 1];
    return last ? { placed: last, levels: placed } : undefined;
  }

  protected blockOfPart(chunk: ProgramChunk, ref: PartRef): number {
    const index = this.partIndex(chunk, ref);
    return index >= 0 ? chunkPartsOf(chunk)![ref[1]][index]!.block : -1;
  }

  protected partIndex(chunk: ProgramChunk, ref: PartRef): number {
    const [p, kind, ordinal] = ref;
    const saved = this._parts[p];
    const now = chunkPartsOf(chunk)?.[kind];
    if (!saved || !now) {
      return -1;
    }
    const { pairs } = alignParts(now.map((part) => partPrint(part.fingerprint)), saved.l);
    return pairs.indexOf(ordinal);
  }

  placePosition(form: SavedPosition | null | undefined): Placed | undefined {
    if (!form || typeof form !== "object" || !form.st) {
      return undefined;
    }
    const statement = this.placeStatement(form.st);
    if (!statement) {
      return undefined;
    }
    const { sequence, entry } = statement.placed;
    const chunk = sequence.arrays.chunks[entry];
    const a = form.a;
    const at = { sequence, entry };
    let position: ProgramPosition;
    let after = false;
    if (a === "end" || !chunk) {
      if (a !== "end" && a !== "start") {
        return undefined;
      }
      position = { sequence, entry: sequence.arrays.chunks.length, offset: 0 };
    } else if (a === "start") {
      position = { sequence, entry, offset: 0 };
    } else if (a === "done") {
      position = { sequence, entry, offset: codeWords(chunk) };
    } else if (Array.isArray(a)) {
      const [offset, layout] = a;
      if (layoutOf(chunk) === layout && offset <= codeWords(chunk)) {
        position = { sequence, entry, offset };
      } else {
        position = { sequence, entry: entry + 1, offset: 0 };
        after = true;
        this.warn(sequence, entry, "a frame inside it resumes after it, since its code differs");
      }
    } else if ("ch" in a) {
      const index = this.partIndex(chunk, a.ch);
      const choice = index >= 0 ? choicesByPart(chunk)?.[index] : undefined;
      if (!choice) {
        return undefined;
      }
      position = { sequence, entry, offset: choice.entry };
    } else {
      const ref = "after" in a ? a.after : a.brk;
      const block = this.blockOfPart(chunk, ref);
      if (block >= 0) {
        position = {
          sequence,
          entry,
          offset: blockField(chunk, block, "after" in a ? B_RESUME : B_BREAK),
        };
      } else {
        position = { sequence, entry: entry + 1, offset: 0 };
        after = true;
        this.warn(sequence, entry, "a body it resumed after is gone, so the frame resumes after it");
      }
    }
    const saved = new Map<string, string | undefined>();
    form.st.levels.forEach((level, i) => {
      const owner = i > 0 ? statement.levels[i - 1] : undefined;
      if (owner) {
        saved.set(`${owner.sequence.id}:${owner.entry}`, level.loop);
      }
    });
    const blocks = blockStackOf(this.root, position.sequence) ?? [];
    for (const block of blocks) {
      const owner = block.sequence.arrays.chunks[block.entry]!;
      if (!(blockFlags(owner, block.block) & BLOCK_LOOP)) {
        continue;
      }
      const hash = saved.get(`${block.sequence.id}:${block.entry}`);
      if (hash === undefined || hash !== layoutOf(owner)) {
        position = { sequence: block.sequence, entry: block.entry + 1, offset: 0 };
        after = true;
        this.warn(
          block.sequence,
          block.entry,
          "a frame inside the loop resumes after it, since the loop's code differs",
        );
        break;
      }
    }
    return { position, after, statement: at };
  }

  placeChoice(
    form: SavedPosition | null | undefined,
    source?: unknown,
  ): { position: ProgramPosition; address: number; after: boolean; statement: Placed["statement"] } | undefined {
    const placed = this.placePosition(form);
    if (!placed) {
      return undefined;
    }
    const chunk = placed.position.sequence.arrays.chunks[placed.position.entry];
    if (!chunk) {
      return undefined;
    }
    if (form && typeof form.a === "object" && !Array.isArray(form.a) && "ch" in form.a) {
      const choice = choicesByPart(chunk)?.find((c) => c.entry === placed.position.offset);
      return choice
        ? { ...placed, address: addressOf(chunkId(chunk), choice.at) }
        : undefined;
    }
    if (placed.after || typeof source !== "number") {
      return undefined;
    }
    return { ...placed, address: addressOf(chunkId(chunk), source) };
  }

  decodeSymbol(form: SavedSymbol | null | undefined): number | undefined {
    if (!form || typeof form !== "object") {
      return undefined;
    }
    const root = this.root;
    if ("gone" in form) {
      return undefined;
    }
    if ("n" in form) {
      const symbol = root.table.symbolIds.get(this.renamed(form.n));
      return symbol === undefined || root.kindOf(symbol) === UNDEFINED_KIND
        ? undefined
        : symbol;
    }
    const statement = this.placeStatement(form.st);
    const chunk = statement
      ? statement.placed.sequence.arrays.chunks[statement.placed.entry]
      : undefined;
    const parts = chunk ? chunkPartsOf(chunk)?.[form.k] : undefined;
    if (!chunk || !parts) {
      return undefined;
    }
    let index = -1;
    if (form.pl !== undefined) {
      index = this.partIndex(chunk, [form.pl, form.k, form.i]);
    } else if (form.p !== undefined) {
      const prints = parts.map((part) => partPrint(part.fingerprint));
      let best = Infinity;
      prints.forEach((print, j) => {
        if (print === form.p && Math.abs(j - form.i) < best) {
          best = Math.abs(j - form.i);
          index = j;
        }
      });
      if (index < 0 && form.i < parts.length) {
        index = form.i;
      }
    }
    const symbol = index >= 0 ? parts[index]!.symbol : -1;
    return symbol >= 0 ? symbol : undefined;
  }

  protected warn(sequence: SequenceRow, entry: number, why: string): void {
    const flow = this.flowNameOf(sequence);
    const name = flow === undefined ? sequence.uri : flow === "" ? "the top level" : `'${flow}'`;
    this.warnings.push(`In ${name}, at statement ${entry}: ${why}.`);
  }
}

const NOWHERE: Placed = {
  position: null as unknown as ProgramPosition,
  after: false,
  statement: null as unknown as Placed["statement"],
};

const afterStatement = (sequence: SequenceRow, entry: number): ProgramPosition => ({
  sequence,
  entry: entry + 1,
  offset: 0,
});

interface ThreadPlan {
  exact: boolean;
  cuts: ThreadCuts | undefined;
}

const planThread = (
  count: number,
  drop: (i: number) => boolean,
  place: (i: number) => Placed | undefined,
  restart: (i: number, placed: Placed) => FlowRestart | undefined = () => undefined,
): ThreadPlan | undefined => {
  let dropFrom = -1;
  for (let i = 1; i < count; i += 1) {
    if (drop(i)) {
      dropFrom = i;
      break;
    }
  }
  const last = dropFrom >= 1 ? dropFrom - 1 : count - 1;
  const after: boolean[] = [];
  let exact = dropFrom < 0;
  let callerAfter: ProgramPosition | null | undefined;
  for (let i = 0; i <= last; i += 1) {
    const placed = place(i);
    if (!placed) {
      return undefined;
    }
    const flow = placed === NOWHERE ? undefined : restart(i, placed);
    if (flow) {
      after.push(false);
      return {
        exact: false,
        cuts: { after, dropFrom: i + 1 < count ? i + 1 : -1, restart: flow },
      };
    }
    after.push(placed.after);
    exact &&= !placed.after;
    if (i === last && dropFrom >= 1) {
      callerAfter =
        placed === NOWHERE
          ? null
          : placed.after
            ? placed.position
            : afterStatement(placed.statement.sequence, placed.statement.entry);
    }
  }
  const cuts =
    dropFrom >= 1 || after.some(Boolean)
      ? { after, dropFrom, callerAfter }
      : undefined;
  return { exact, cuts };
};

const NEVER_VISITED = -0x80000000;

class SaveWriter implements StateCodec {
  protected _forms: FormWriter;
  protected _identities = new WeakMap<object, number>();
  protected _nextIdentity = 0;

  constructor(
    protected _state: ProgramStoryState,
    protected _gameVersion: string,
  ) {
    this._forms = new FormWriter(_state.root);
  }

  protected get root(): ProgramRoot {
    return this._state.root;
  }

  begin(writer: SimpleJson.Writer): void {
    JsonSerialisation.SetWriterSymbolEncoder(writer, (value) =>
      JSON.stringify(this.valueForm(value)),
    );
  }

  protected valueForm(value: SymbolValue): SavedSymbol {
    let symbol: number | undefined;
    try {
      symbol = this.symbolOf(value);
      return this._forms.symbolForm(symbol, value.ref.label);
    } catch {
      return value.ref.name !== null ? { n: value.ref.name } : { gone: value.ref.label };
    }
  }

  position(writer: SimpleJson.Writer, position: ProgramPosition | null): void {
    if (!position) {
      writer.WriteNull();
      return;
    }
    writer.WriteInjected(this._forms.positionForm(position));
  }

  frameSymbol(writer: SimpleJson.Writer, symbol: number): void {
    if (symbol < 0) {
      return;
    }
    writer.WritePropertyStart("fn");
    writer.WriteInjected(this._forms.symbolForm(symbol, this.root.labelOf(symbol)));
    writer.WritePropertyEnd();
    const bound = bindingLayout(this.root, symbol);
    if (bound !== undefined) {
      writer.WriteProperty("bound", bound);
    }
  }

  choiceSource(writer: SimpleJson.Writer, choice: ProgramChoice): void {
    const chunk = choice.target.sequence.arrays.chunks[choice.target.entry];
    const address = Number(choice.sourcePath);
    if (chunk && Number.isFinite(address) && !choicesByPart(chunk)) {
      writer.WriteIntProperty("source", address - addressOf(chunkId(chunk), 0));
    }
  }

  addresses(writer: SimpleJson.Writer, addresses: readonly number[]): void {
    const forms: string[] = [];
    for (const address of addresses) {
      const form = durableAddress(this.root, address);
      if (form !== undefined) forms.push(form);
    }
    writer.WriteInjected(forms);
  }

  counts(writer: SimpleJson.Writer): void {
    writer.WriteProperty("counts", (w) => {
      w.WriteArrayStart();
      const size = Math.max(this._state.visits.length, this._state.turns.length);
      for (let id = 0; id < size; id += 1) {
        this.writeCount(w, id, false);
      }
      w.WriteArrayEnd();
    });
  }

  protected _symbolOf: number[] | null = null;

  protected writeCount(w: SimpleJson.Writer, id: number, always: boolean): void {
    const state = this._state;
    const table = this.root.table;
    if (!this._symbolOf) {
      const symbolOf: number[] = [];
      table.countIds.forEach((count, symbol) => {
        if (count >= 0) symbolOf[count] = symbol;
      });
      this._symbolOf = symbolOf;
    }
    const visits = state.visits[id] ?? 0;
    const turn = state.turns[id] ?? NEVER_VISITED;
    const symbol = this._symbolOf[id];
    if ((!always && visits === 0 && turn === NEVER_VISITED) || symbol === undefined) {
      return;
    }
    if (this.root.kindOf(symbol) === UNDEFINED_KIND) {
      return;
    }
    w.WriteInjected([
      this._forms.symbolForm(symbol, table.symbols[symbol]!),
      visits,
      turn === NEVER_VISITED ? null : turn,
    ]);
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

  readAddresses(): number[] {
    throw new Error("A save writer reads nothing.");
  }

  readCounts(): void {
    throw new Error("A save writer reads nothing.");
  }

  protected symbolOf(value: SymbolValue): number {
    const ref = value.ref;
    const root = this.root;
    const id =
      ref.generation === root.generation
        ? ref.symbol
        : root.symbolFrom(ref.symbol, ref.generation);
    if (id !== undefined && id >= 0 && (ref.name === null || root.table.symbols[id] === ref.name)) {
      return id;
    }
    const named = ref.name === null ? undefined : root.table.symbolIds.get(ref.name);
    if (named === undefined) {
      throw new Error(`The function value ${ref.label} names nothing in its program.`);
    }
    return named;
  }

  protected identity(obj: object): number {
    let id = this._identities.get(obj);
    if (id === undefined) {
      id = this._nextIdentity++;
      this._identities.set(obj, id);
    }
    return id;
  }

  protected valueSignature(value: InkObject | null | undefined): string {
    if (value === null || value === undefined) return "-";
    if (value instanceof ObjectValue || value instanceof VariablePointerValue) {
      return `#${this.identity(value)}`;
    }
    if (
      value instanceof IntValue ||
      value instanceof FloatValue ||
      value instanceof StringValue ||
      value instanceof BoolValue
    ) {
      return `${value.constructor.name}:${String(value.value)}`;
    }
    if (value instanceof SymbolValue) {
      return `sym:${value.ref.generation}:${value.ref.symbol}:${value.ref.name ?? ""}`;
    }
    const scratch = new SimpleJson.Writer();
    scratch.WriteArrayStart();
    JsonSerialisation.WriteRuntimeObject(scratch, value);
    scratch.WriteArrayEnd();
    return `${value.constructor.name}:${scratch.toString()}`;
  }

  protected tableSignature(table: ObjectValue): string {
    const map = table.value as (Map<string, any> & { __luauCapacity?: number; __luauBoundary?: number }) | null;
    const entries: [string, string][] = [];
    for (const [key, value] of map ?? []) {
      if (key === "__iter_key_snapshot") continue;
      entries.push([key, this.valueSignature(value)]);
    }
    return JSON.stringify([
      table.metatable ? this.identity(table.metatable) : -1,
      table.isFrozen,
      map?.__luauCapacity ?? null,
      map?.__luauBoundary ?? null,
      entries,
    ]);
  }

  protected cellSignature(cell: VariablePointerValue): string {
    return JSON.stringify([
      cell.isClosed,
      cell.isClosed ? this.valueSignature(cell.closedValue) : null,
      cell.contextIndex,
      cell.scopeIndex,
    ]);
  }

  writeBeats(
    beats: readonly BeatRecord[],
    chosen: number | undefined,
    restore: (image: ProgramImage) => boolean,
  ): string {
    const state = this._state;
    const variables = state.variablesState;
    const writer = state.stateWriter();
    this.begin(writer);
    writer.WriteObjectStart();
    writer.WriteProperty("engine", "program");
    writer.WriteIntProperty("format", SAVE_FORMAT);
    writer.WriteProperty("engineVersion", PROGRAM_ENGINE_VERSION);
    writer.WriteProperty("gameVersion", this._gameVersion);
    let globals = new Map<string, string>();
    let tables = new Map<number, string>();
    let cells = new Map<number, string>();
    let visits = new Uint32Array(0);
    let turns = new Int32Array(0);
    writer.WriteProperty("beats", (w) => {
      w.WriteArrayStart();
      beats.forEach((beat, j) => {
        if (!restore(beat.image)) {
          throw new Error("A beat of the save cannot be restored.");
        }
        const known = new Set(JsonSerialisation.WrittenTables(w).keys());
        const knownCells = new Set(JsonSerialisation.WrittenCells(w).values());
        w.WriteObjectStart();
        w.WriteIntProperty("flags", beat.flags);
        w.WriteProperty("decisions", (dw) => {
          dw.WriteArrayStart();
          for (const address of beat.decisions) {
            const form = this._forms.choiceForm(address);
            if (form) dw.WriteInjected(form);
          }
          dw.WriteArrayEnd();
        });
        state.writeHead(w, this);
        const now = new Map<string, string>();
        for (const [name, value] of variables.globalEntries) {
          if (!variables.constantNames.has(name)) {
            now.set(name, this.valueSignature(value));
          }
        }
        if (j === 0) {
          w.WriteProperty("variablesState", (vw) => {
            const policy = variables.constructor as unknown as { dontSaveDefaultValues: boolean };
            const skip = policy.dontSaveDefaultValues;
            policy.dontSaveDefaultValues = false;
            try {
              variables.WriteJson(vw);
            } finally {
              policy.dontSaveDefaultValues = skip;
            }
          });
          state.writeTail(w, this);
          this.counts(w);
        } else {
          w.WriteProperty("globals", (gw) => {
            gw.WriteObjectStart();
            for (const [name, signature] of now) {
              if (globals.get(name) !== signature) {
                gw.WritePropertyStart(name);
                JsonSerialisation.WriteRuntimeObject(gw, variables.globalEntries.get(name)!);
                gw.WritePropertyEnd();
              }
            }
            gw.WriteObjectEnd();
          });
          const gone = [...globals.keys()].filter((name) => !now.has(name));
          if (gone.length > 0) {
            w.WriteProperty("gone", (gw) => {
              gw.WriteArrayStart();
              gone.forEach((name) => gw.Write(name));
              gw.WriteArrayEnd();
            });
          }
          state.writeTail(w, this);
          w.WriteProperty("counts", (cw) => {
            cw.WriteArrayStart();
            const size = Math.max(state.visits.length, state.turns.length);
            for (let id = 0; id < size; id += 1) {
              const v = state.visits[id] ?? 0;
              const t = state.turns[id] ?? NEVER_VISITED;
              if (v !== (visits[id] ?? 0) || t !== (turns[id] ?? NEVER_VISITED)) {
                this.writeCount(cw, id, true);
              }
            }
            cw.WriteArrayEnd();
          });
          w.WriteProperty("tables", (tw) => {
            tw.WriteArrayStart();
            for (const [id, table] of JsonSerialisation.WrittenTables(w)) {
              if (known.has(id) && tables.get(id) !== this.tableSignature(table)) {
                JsonSerialisation.WriteTableDefinition(tw, table);
              }
            }
            tw.WriteArrayEnd();
          });
          w.WriteProperty("cells", (cw) => {
            cw.WriteArrayStart();
            for (const [cell, id] of JsonSerialisation.WrittenCells(w)) {
              if (!knownCells.has(id) || cells.get(id) === this.cellSignature(cell)) {
                continue;
              }
              cw.WriteArrayStart();
              cw.WriteInt(id);
              cw.WriteInt(cell.isClosed ? 1 : 0);
              cw.WriteInt(cell.contextIndex);
              cw.WriteInt(cell.scopeIndex);
              if (cell.isClosed && cell.closedValue) {
                JsonSerialisation.WriteRuntimeObject(cw, cell.closedValue);
              }
              cw.WriteArrayEnd();
            }
            cw.WriteArrayEnd();
          });
        }
        w.WriteObjectEnd();
        globals = now;
        tables = new Map();
        for (const [id, table] of JsonSerialisation.WrittenTables(w)) {
          tables.set(id, this.tableSignature(table));
        }
        cells = new Map();
        for (const [cell, id] of JsonSerialisation.WrittenCells(w)) {
          cells.set(id, this.cellSignature(cell));
        }
        visits = state.visits.slice();
        turns = state.turns.slice();
      });
      w.WriteArrayEnd();
    });
    const chosenForm = chosen === undefined ? undefined : this._forms.choiceForm(chosen);
    if (chosenForm) {
      writer.WriteProperty("chosen", (w) => w.WriteInjected(chosenForm));
    }
    const listings = this._forms.listings();
    const parts = this._forms.parts();
    writer.WriteProperty("listings", (w) => w.WriteInjected(listings));
    writer.WriteProperty("parts", (w) => w.WriteInjected(parts));
    writer.WriteObjectEnd();
    state.cellsWritten?.(JsonSerialisation.WrittenCells(writer));
    return writer.toString();
  }
}

interface BeatPlan {
  placed: boolean;
  exact: boolean;
  positions: Map<unknown, ProgramPosition>;
  cuts: Map<unknown, ThreadCuts>;
  choices: Map<unknown, number>;
  flow: string;
  warnings: string[];
}

class SaveReader {
  protected _placer: FormPlacer;
  protected _warnings: string[] = [];
  _chosenUnplaced = false;

  constructor(
    protected _state: ProgramStoryState,
    protected _save: Record<string, any>,
    protected _symbolValue: (symbol: number) => SymbolValue,
  ) {
    this._placer = new FormPlacer(
      _state.root,
      Array.isArray(_save["listings"]) ? _save["listings"] : [],
      Array.isArray(_save["parts"]) ? _save["parts"] : [],
    );
  }

  protected get root(): ProgramRoot {
    return this._state.root;
  }

  get beats(): Record<string, any>[] {
    return Array.isArray(this._save["beats"]) ? this._save["beats"] : [];
  }

  protected flowOf(form: unknown): string {
    const level = (form as SavedPosition | null)?.st?.levels?.[0];
    return level?.flow ?? level?.decl ?? "";
  }

  protected dropsFrame(saved: Record<string, any>): boolean {
    const form = saved?.["fn"] as SavedSymbol | undefined;
    if (!form || typeof form !== "object") {
      return false;
    }
    const symbol = this._placer.decodeSymbol(form);
    const name = "n" in form ? `'${form.n}'` : "an anonymous function";
    if (symbol === undefined) {
      this._placer.warnings.push(
        `The frame of ${name} is dropped, since the program no longer has it; its caller resumes after the statement that called it.`,
      );
      return true;
    }
    const bound = saved["bound"];
    if (typeof bound !== "string" || bindingLayout(this.root, symbol) === bound) {
      return false;
    }
    this._placer.warnings.push(
      `The frame of ${name} is dropped, since it binds its parameters in other code; its caller resumes after the statement that called it.`,
    );
    return true;
  }

  planBeat(beat: Record<string, any>): BeatPlan {
    const warned = this._placer.warnings.length;
    const plan: BeatPlan = {
      placed: true,
      exact: true,
      positions: new Map(),
      cuts: new Map(),
      choices: new Map(),
      flow: this.flowOf(beat?.["position"]),
      warnings: [],
    };
    const thread = (
      frames: unknown,
      top: unknown,
      placeTop: (form: unknown) => Placed | undefined,
      choice = false,
    ): boolean => {
      const saved = (Array.isArray(frames) ? frames : []) as Record<string, any>[];
      const count = Math.max(1, saved.length);
      const forms = (i: number) => (i < count - 1 ? saved[i + 1]?.["returnTo"] : top);
      for (let i = 0; i < count; i += 1) {
        const form = forms(i);
        const st = (form as SavedPosition | null | undefined)?.st;
        if (st) {
          this._placer.placeStatement(st);
        }
      }
      const placed: (Placed | undefined)[] = [];
      let restarted = false;
      const result = planThread(
        count,
        (i) => this.dropsFrame(saved[i] ?? {}),
        (i) => {
          const form = forms(i);
          placed[i] =
            form === null || form === undefined
              ? NOWHERE
              : i === count - 1
                ? placeTop(form)
                : this._placer.placePosition(form as SavedPosition);
          return placed[i];
        },
        (i, at) => {
          const level = (forms(i) as SavedPosition | null | undefined)?.st?.levels?.[0];
          const restart = flowRestart(
            this.root,
            level,
            at.position.sequence,
            savedScopeNames(saved[i]),
          );
          if (restart) {
            restarted = true;
            this._placer.warnings.push(
              choice
                ? `A choice raised in '${restart.flow}' is dropped, since the flow's parameters changed.`
                : `The save inside '${restart.flow}' resumes at its start, since its parameters changed; each parameter takes the saved argument of the same name, or nil.`,
            );
          }
          return restart;
        },
      );
      if (!result || (choice && restarted)) {
        return false;
      }
      placed.forEach((at, i) => {
        const form = forms(i);
        if (at && at !== NOWHERE && form) plan.positions.set(form, at.position);
      });
      if (result.cuts) {
        plan.cuts.set(frames, result.cuts);
      }
      plan.exact &&= result.exact;
      return true;
    };
    const position = (form: unknown) => this._placer.placePosition(form as SavedPosition);
    let placed = thread(beat?.["frames"], beat?.["position"], position);
    for (const saved of Array.isArray(beat?.["threads"]) ? beat["threads"] : []) {
      placed &&= thread(saved?.["frames"], saved?.["position"], position);
    }
    if (!placed) {
      plan.placed = false;
    } else {
      for (const saved of Array.isArray(beat?.["choices"]) ? beat["choices"] : []) {
        let address: number | undefined;
        const ok = thread(saved?.["frames"], saved?.["target"], (form) => {
          const choice = this._placer.placeChoice(form as SavedPosition, saved?.["source"]);
          address = choice?.address;
          return choice;
        }, true);
        if (!ok || address === undefined) {
          plan.warnings.push(
            `A choice waiting at the saved beat (${JSON.stringify(String(saved?.["text"] ?? ""))}) cannot be placed, and was dropped.`,
          );
          plan.exact = false;
          continue;
        }
        plan.choices.set(saved, address);
      }
    }
    plan.warnings.unshift(...this._placer.warnings.splice(warned));
    return plan;
  }

  plan(): { index: number; plans: (BeatPlan | null)[]; chosen: SavedPosition | null } {
    const beats = this.beats;
    if (beats.length === 0) {
      throw new SaveRefused("The save holds no beat.");
    }
    const first = this.select();
    const before = this._placer.renames.length;
    this._placer.settleRenames();
    if (this._placer.renames.length === before) {
      return this.selected(first);
    }
    this._warnings.length = 0;
    this._placer.warnings.length = 0;
    this._chosenUnplaced = false;
    const second = this.select();
    this._placer.settleRenames();
    return this.selected(second);
  }

  protected select():
    | { index: number; plans: (BeatPlan | null)[]; chosen: SavedPosition | null }
    | { refused: string } {
    const beats = this.beats;
    const plans: (BeatPlan | null)[] = beats.map(() => null);
    const planOf = (j: number) => (plans[j] ??= this.planBeat(beats[j]!));
    const newest = beats.length - 1;
    let chosen: SavedPosition | null = null;
    const saved = this._save["chosen"];
    if (saved && typeof saved === "object") {
      const form = saved as SavedPosition;
      if (planOf(newest).placed && this._placer.placeChoice(form)) {
        chosen = form;
      } else {
        this._warnings.push("The choice made after the saved beat cannot be placed.");
        this._chosenUnplaced = true;
      }
    }
    const chosenAt = (index: number) => {
      for (let j = 0; j < index; j += 1) planOf(j);
      return { index, plans, chosen: index === newest ? chosen : null };
    };
    let fallback = -1;
    for (let j = newest; j >= 0; j -= 1) {
      const plan = planOf(j);
      if (!plan.placed) continue;
      if (plan.exact) {
        return chosenAt(j);
      }
      if (fallback < 0) fallback = j;
    }
    if (fallback >= 0) {
      return chosenAt(fallback);
    }
    return { refused: planOf(newest).flow };
  }

  protected selected(
    choice:
      | { index: number; plans: (BeatPlan | null)[]; chosen: SavedPosition | null }
      | { refused: string },
  ): { index: number; plans: (BeatPlan | null)[]; chosen: SavedPosition | null } {
    if (!("refused" in choice)) {
      return choice;
    }
    const flow = choice.refused;
    const name = flow === "" ? "the top level" : `'${flow}'`;
    throw new SaveRefused(
      `The save cannot be placed in this program: in ${name}, no beat it holds can be placed.`,
      flow,
    );
  }

  warningsOf(plan: BeatPlan | null): string[] {
    return [...(plan?.warnings ?? []), ...this._warnings, ...this._placer.warnings];
  }

  protected codecOf(plan: BeatPlan): StateCodec {
    const reader = this;
    return {
      position() {
        throw new Error("A save reader writes nothing.");
      },
      frameSymbol() {
        throw new Error("A save reader writes nothing.");
      },
      choiceSource() {
        throw new Error("A save reader writes nothing.");
      },
      addresses() {
        throw new Error("A save reader writes nothing.");
      },
      counts() {
        throw new Error("A save reader writes nothing.");
      },
      readAddresses: (saved) =>
        Array.isArray(saved)
          ? saved.flatMap((form) => {
              const address =
                typeof form === "string"
                  ? placeDurableAddress(reader.root, form)
                  : undefined;
              return address === undefined ? [] : [address];
            })
          : [],
      place: (saved) => (saved ? (plan.positions.get(saved) ?? null) : null),
      readFrameSymbol: (saved) => reader._placer.decodeSymbol(saved["fn"]) ?? -1,
      readChoiceSource: (saved) => {
        const address = plan.choices.get(saved);
        return address === undefined ? "" : String(address);
      },
      readCounts: () => {},
      cutsOf: (frames) => plan.cuts.get(frames),
      skip: (saved) => JsonSerialisation.ReadDefinitions(saved),
    };
  }

  protected readCounts(beat: Record<string, any>, mark: boolean): void {
    const state = this._state;
    for (const entry of Array.isArray(beat["counts"]) ? beat["counts"] : []) {
      const [form, visits, turn] = entry as [SavedSymbol, number, number | null];
      const symbol = this._placer.decodeSymbol(form);
      if (symbol === undefined) continue;
      const id = countIdOf(this.root.table, symbol);
      if (id < 0) continue;
      if (mark) state.images?.count(id);
      state.SetCount(id, Number(visits), turn === null ? NEVER_VISITED : Number(turn));
    }
  }

  protected renameFlows(token: unknown): void {
    if (this._placer.renames.length === 0 || !token || typeof token !== "object") {
      return;
    }
    if (Array.isArray(token)) {
      token.forEach((item) => this.renameFlows(item));
      return;
    }
    const obj = token as Record<string, any>;
    if (typeof obj["previousFlow"] === "string") {
      obj["previousFlow"] = this._placer.renamed(obj["previousFlow"]);
    }
    for (const [key, value] of Object.entries(obj)) {
      if (key !== "previousFlow" && key !== "variablesState" && key !== "globals") {
        this.renameFlows(value);
      }
    }
  }

  apply(
    index: number,
    plans: (BeatPlan | null)[],
    onBeat: (beat: Record<string, any>, plan: BeatPlan) => void,
  ): void {
    const state = this._state;
    const variables = state.variablesState;
    this._placer.settleRenames();
    JsonSerialisation.SetLoadSessionSymbolDecoder((saved) => {
      const form = JSON.parse(saved) as SavedSymbol;
      const symbol = this._placer.decodeSymbol(form);
      if (symbol === undefined) {
        const name = "n" in form ? form.n : null;
        const label = "gone" in form ? form.gone : (name ?? "function");
        this._warnings.push(`A function value of the save (${name ?? "an anonymous function"}) names nothing in this program.`);
        return new SymbolValue(new SymbolRef(-1, this.root.generation, name, label));
      }
      return this._symbolValue(symbol);
    });
    const beats = this.beats;
    for (let j = 0; j <= index; j += 1) {
      const beat = beats[j]!;
      const plan = plans[j] ?? this.planBeat(beat);
      this.renameFlows(beat);
      const codec = this.codecOf(plan);
      const head = () => {
        if (plan.placed) {
          state.readHead(beat, codec);
        } else {
          JsonSerialisation.ReadDefinitions([beat["evalStack"], beat["output"], beat["carried"]]);
        }
      };
      const cut = new Map<VariablePointerValue, CellCopy>();
      const tail = () => {
        if (!plan.placed) {
          JsonSerialisation.ReadDefinitions([beat["frames"], beat["threads"], beat["choices"]]);
          return;
        }
        const callStack = state.callStack;
        const barrier = callStack.cellBarrier;
        callStack.cellBarrier = (cell) => {
          if (!cut.has(cell)) cut.set(cell, copyCell(cell));
          barrier?.(cell);
        };
        try {
          state.readTail(beat, codec);
        } finally {
          callStack.cellBarrier = barrier;
        }
      };
      head();
      if (j === 0) {
        variables.SetJsonToken(beat["variablesState"] ?? {});
        tail();
        state.visits = new Uint32Array(0);
        state.turns = new Int32Array(0);
        this.readCounts(beat, false);
      } else {
        const tracker = state.images;
        const globals = beat["globals"] ?? {};
        for (const name of Object.keys(globals)) {
          const value = JsonSerialisation.JTokenToRuntimeObject(globals[name]);
          if (variables.constantNames.has(name)) continue;
          tracker?.global(name);
          variables.RestoreGlobal(name, value ?? undefined);
        }
        for (const name of Array.isArray(beat["gone"]) ? beat["gone"] : []) {
          if (variables.constantNames.has(String(name))) continue;
          tracker?.global(String(name));
          variables.RestoreGlobal(String(name), undefined);
        }
        this.readCounts(beat, true);
        for (const token of Array.isArray(beat["tables"]) ? beat["tables"] : []) {
          JsonSerialisation.RedefineLoadSessionTable(token, (table) => tracker?.table(table));
        }
        for (const saved of Array.isArray(beat["cells"]) ? beat["cells"] : []) {
          const [id, closed, contextIndex, scopeIndex, value] = saved as [number, number, number, number, unknown];
          const cell = JsonSerialisation.LoadSessionCell(Number(id));
          if (!cell) continue;
          tracker?.cell(cell);
          putCell(cell, {
            closed: closed === 1,
            value: closed === 1 && value !== undefined ? JsonSerialisation.JTokenToRuntimeObject(value) : null,
            contextIndex: Number(contextIndex),
            scopeIndex: Number(scopeIndex),
          });
        }
        tail();
      }
      state.endLoad();
      if (plan.placed) {
        onBeat(beat, plan);
      }
      if (j < index) {
        for (const [cell, copy] of cut) {
          state.images?.cell(cell);
          putCell(cell, copy);
        }
      }
    }
  }

  decisionsOf(beat: Record<string, any>): number[] {
    const out: number[] = [];
    for (const form of Array.isArray(beat["decisions"]) ? beat["decisions"] : []) {
      const placed = this._placer.placeChoice(form);
      if (placed) out.push(placed.address);
    }
    return out;
  }

  choiceAddress(form: SavedPosition): number | undefined {
    return this._placer.placeChoice(form)?.address;
  }
}

export const writeSave = (
  state: ProgramStoryState,
  gameVersion: string,
  beats: readonly BeatRecord[],
  chosen: number | undefined,
  restore: (image: ProgramImage) => boolean,
): string => new SaveWriter(state, gameVersion).writeBeats(beats, chosen, restore);

export interface SaveLoad {
  header: SaveHeader;
  report: SaveReport;
  chosen: number | undefined;
}

export const readSave = (
  state: ProgramStoryState,
  json: string,
  symbolValue: (symbol: number) => SymbolValue,
  onBeat: (flags: number, decisions: number[]) => void = () => {},
): SaveLoad => {
  const { save, format } = parseSave(json);
  const reader = new SaveReader(state, save, symbolValue);
  const { index, plans, chosen } = reader.plan();
  state.beginLoad();
  try {
    reader.apply(index, plans, (beat) =>
      onBeat(Number(beat["flags"] ?? BEAT_WAITED), reader.decisionsOf(beat)),
    );
    state.cellsRead?.(JsonSerialisation.LoadSessionCells());
  } finally {
    JsonSerialisation.ResetObjectLoadSession();
  }
  state.ResetErrors();
  state.OutputStreamDirty();
  return {
    header: {
      format,
      engine: String(save["engine"]),
      engineVersion: String(save["engineVersion"] ?? ""),
      gameVersion: String(save["gameVersion"] ?? ""),
    },
    report: {
      beat: index,
      beats: reader.beats.length,
      exact: plans[index]?.exact ?? false,
      warnings: reader.warningsOf(plans[index] ?? null),
      chosen: reader._chosenUnplaced ? "unplaced" : null,
    },
    chosen: chosen ? reader.choiceAddress(chosen) : undefined,
  };
};

export const checkSave = (state: ProgramStoryState, json: string): void => {
  const { save } = parseSave(json);
  new SaveReader(state, save, () => {
    throw new Error("A check reads no value.");
  }).plan();
};

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

export const translateChoiceAddress = (
  root: ProgramRoot,
  from: ProgramRoot,
  address: number,
): number | undefined => {
  if (from === root || root.position(chunkOfAddress(address))) {
    return address;
  }
  const forms = new FormWriter(from);
  const form = forms.choiceForm(address);
  return form ? new FormPlacer(root, forms.listings(), forms.parts()).placeChoice(form)?.address : undefined;
};

export const translatePositional = (
  state: ProgramStoryState,
  from: ProgramRoot,
  copy: PositionalCopy,
  generation: number,
): PlacedPositional | undefined => {
  const root = state.root;
  const forms = new FormWriter(from);
  const remap = (symbol: number): number =>
    symbol < 0 || generation === root.generation
      ? symbol
      : (root.symbolFrom(symbol, generation) ?? -1);
  const old = (saved: PositionCopy | null): ProgramPosition | null => {
    if (!saved) return null;
    if (saved.chunk < 0) {
      const sequence = from.sequence(saved.sequence);
      return sequence ? { sequence, entry: sequence.arrays.chunks.length, offset: 0 } : null;
    }
    const at = from.position(saved.chunk, saved.entry);
    return at ? { sequence: at.sequence, entry: at.entry, offset: saved.offset } : null;
  };
  const held = (saved: PositionCopy | null): ProgramPosition | undefined => {
    if (!saved) return undefined;
    if (saved.chunk < 0) {
      const sequence = root.sequence(saved.sequence);
      return sequence && blockStackOf(root, sequence)
        ? { sequence, entry: sequence.arrays.chunks.length, offset: 0 }
        : undefined;
    }
    const after = saved.after >= 0 ? root.position(saved.after, saved.entry - 1) : undefined;
    const at = root.position(saved.chunk, saved.entry);
    if (!at || !blockStackOf(root, at.sequence)) return undefined;
    return after
      ? { sequence: after.sequence, entry: after.entry + 1, offset: 0 }
      : { sequence: at.sequence, entry: at.entry, offset: saved.offset };
  };
  const savedForms = new Map<PositionCopy, SavedPosition>();
  const note = (saved: PositionCopy | null) => {
    if (saved && !held(saved)) {
      const position = old(saved);
      if (position) savedForms.set(saved, forms.positionForm(position));
    }
  };
  const noteThread = (thread: ThreadCopy) => {
    thread.elements.forEach((element) => note(element.frame?.returnTo ?? null));
    note(thread.resume?.position ?? null);
  };
  note(copy.position);
  copy.threads.forEach(noteThread);
  copy.choices.forEach((choice) => {
    note(choice.target);
    noteThread(choice.thread);
  });
  const placer = new FormPlacer(root, forms.listings(), forms.parts());
  const place = (saved: PositionCopy | null): Placed | undefined => {
    if (!saved) {
      return NOWHERE;
    }
    const kept = held(saved);
    if (kept) {
      return { position: kept, after: false, statement: { sequence: kept.sequence, entry: kept.entry } };
    }
    const form = savedForms.get(saved);
    return form ? placer.placePosition(form) : undefined;
  };
  const drops = (symbol: number): boolean => {
    const was = symbol >= 0 ? bindingLayout(from, symbol) : undefined;
    if (was === undefined) return false;
    const now = remap(symbol);
    return now < 0 || bindingLayout(root, now) !== was;
  };
  const restarts = (
    saved: PositionCopy | null,
    at: Placed,
    scopes: readonly ReadonlyMap<string, unknown>[] | undefined,
  ) => {
    const was = old(saved);
    if (!was) return undefined;
    return flowRestart(
      root,
      positionBindings(from, was.sequence),
      at.position.sequence,
      scopes?.map((scope) => [...scope.keys()]),
    );
  };
  const placeThread = (
    thread: ThreadCopy,
    top: PositionCopy | null,
    choice = false,
  ): { thread: PlacedThread; top: ProgramPosition | null } | undefined => {
    const elements = thread.elements;
    const count = Math.max(1, elements.length);
    const positionOf = (i: number) =>
      i < count - 1 ? (elements[i + 1]?.frame?.returnTo ?? null) : top;
    const placed: (Placed | undefined)[] = [];
    const plan = planThread(
      count,
      (i) => drops(elements[i]?.frame?.symbol ?? -1),
      (i) => (placed[i] = place(positionOf(i))),
      (i, at) => restarts(positionOf(i), at, elements[i]?.scopes),
    );
    if (!plan || (choice && plan.cuts?.restart)) return undefined;
    const at = (i: number) => {
      const p = placed[i];
      return p && p !== NOWHERE ? p.position : null;
    };
    return {
      thread: {
        copy: thread,
        returns: elements.map((element, i) => (element.frame && i >= 1 ? at(i - 1) : null)),
        resume: thread.resume ? at(count - 1) : null,
        cuts: plan.cuts,
      },
      top: at(count - 1),
    };
  };
  const threads: PlacedThread[] = [];
  let position: ProgramPosition | null = null;
  for (let t = 0; t < copy.threads.length; t += 1) {
    const thread = copy.threads[t]!;
    const current = t === copy.threads.length - 1;
    const placed = placeThread(thread, current ? copy.position : (thread.resume?.position ?? null));
    if (!placed) return undefined;
    threads.push(placed.thread);
    if (current) position = placed.top;
  }
  const choices: PlacedPositional["choices"] = copy.choices.map((choice) => {
    const placed = placeThread(choice.thread, choice.target, true);
    const target = placed?.top ?? null;
    const chunk = target?.sequence.arrays.chunks[target.entry];
    const entry = chunk ? choicesByPart(chunk)?.find((c) => c.entry === target!.offset) : undefined;
    if (!placed || !target || !chunk) {
      return {
        target: null,
        thread: placed?.thread ?? { copy: choice.thread, returns: [], resume: null },
        dropped: true,
      };
    }
    return {
      target,
      thread: placed.thread,
      sourcePath: entry ? String(addressOf(chunkId(chunk), entry.at)) : undefined,
    };
  });
  return {
    copy,
    position,
    threads,
    choices,
    remap: generation === root.generation ? undefined : remap,
  };
};

interface DurableAddress {
  f?: string;
  d?: string;
  l: [number, number][];
  p: string;
  o: number;
}

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
  let chunk: ProgramChunk | undefined;
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
