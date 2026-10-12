// Checkpoint storage.
//
// For live preview the engine saves a checkpoint at EVERY beat (so re-planning a
// route can resume from the last valid checkpoint instead of replaying from
// zero). `step.checkpoint` indexes into the store: index i is the checkpoint
// of the i-th beat.
//
// The story keeps images of its state (#699, docs/engine/binary-program.md,
// section 7), and a checkpoint is its beat's image: a keyframe image every
// `baseInterval` beats and a delta image between, which holds the count ids,
// globals, tables and cells written that beat and no JSON, beside the module
// state and the runtime collections. Neither holds the runtime collections
// whole: they grow with every beat run (one executed position or more per
// beat), so a whole copy in every keyframe would make the store quadratic in
// the beats (#1694). Every entry, a keyframe too, holds the collections'
// changes since the entry before it, and a checkpoint's collections are those
// changes replayed from the chain's start. Collections replaced since the
// entry before (an ordinary continue starts them again every beat, a load
// replaces them) start a new chain with a whole copy, as does a keyframe
// whose live collections differ from that replay (#1701). The module state is the save with the story and the
// collections left out, in a keyframe as in a delta. A checkpoint's full save
// is written from its image when a caller asks for it (`getJson`), and a game
// restores a checkpoint's image in place (`imageAt`).

import type { RecencyEntry } from "./RecencySet";

/** Ordered full / per-beat runtime collections (executed addresses, choices,
 *  conditions). */
export interface RuntimeCollections {
  pe: RecencyEntry[];
  ce: { options: string[]; selected: number }[];
  cde: { selected: boolean }[];
}

/** Host hooks the store needs from the Game (kept minimal to avoid coupling to
 *  the Game generic). */
export interface CheckpointHost {
  /** Full ordered snapshot of the runtime collections. */
  snapshotRuntime(): RuntimeCollections;
  /** Runtime-collection changes since the last drain, or null when the
   *  collections were replaced since (a record started again or loaded),
   *  and advance the marks. */
  drainRuntime(): RuntimeCollections | null;
  /** The image of the story's current beat, a keyframe when `keyframe` is
   *  set. */
  captureImage(keyframe: boolean): unknown;
  /** SaveData JSON for the current beat with the story left out and the
   *  runtime collections emptied. */
  saveWithoutStory(): string;
  /** The story's part of a full save, written from a checkpoint's image, or
   *  null when the image cannot be written by the story as it is now. */
  storyOfImage(image: unknown): string | null;
  /** The executed positions as a full save written from an image holds
   *  them: each address in its durable form, since the save may load in
   *  another process (#700). */
  durableExecuted(executed: RecencyEntry[]): RecencyEntry[];
}

interface ImageEntry {
  keyframe: boolean;
  image: unknown;
  // SaveData JSON with the story left out and the runtime collections
  // emptied.
  body: string;
  // The runtime collections' changes since the entry before, or, when
  // `chainStart` is set, the collections whole.
  rt: RuntimeCollections;
  chainStart: boolean;
}

// The runtime collections as a chain of image entries replays them.
interface RuntimeChain {
  pe: Set<RecencyEntry>;
  ce: RuntimeCollections["ce"];
  cde: RuntimeCollections["cde"];
}

export class CheckpointStore {
  protected _entries: ImageEntry[] = [];

  protected _host: CheckpointHost;
  protected _baseInterval: number;

  // The runtime collections of the last entry, as `runtimeAt` replays them,
  // kept up to date as entries are captured so that a keyframe can be
  // compared with them without a replay; null after a truncate, until the
  // next capture replays it again.
  protected _chainEnd: RuntimeChain | null = null;

  /** Introspection for tests/diagnostics: how the N checkpoints are stored. */
  get stats(): {
    total: number;
    keyframes: number;
    deltas: number;
  } {
    let keyframes = 0;
    for (const e of this._entries) {
      if (e.keyframe) {
        keyframes++;
      }
    }
    const total = this._entries.length;
    return { total, keyframes, deltas: total - keyframes };
  }

  constructor(host: CheckpointHost, options?: { baseInterval?: number }) {
    this._host = host;
    this._baseInterval = Math.max(1, options?.baseInterval ?? 50);
  }

  get length(): number {
    return this._entries.length;
  }

  /** Append a checkpoint capturing the host's CURRENT beat state. */
  capture(): void {
    const index = this._entries.length;
    const keyframe = index % this._baseInterval === 0;
    const image = this._host.captureImage(keyframe);
    const changes = this._host.drainRuntime();
    const body = this._host.saveWithoutStory();
    // Collections replaced since the entry before (an ordinary continue
    // starts them again every beat, a load replaces them) hold no changes
    // to that entry's, so they start a chain of their own (#1701).
    let chainStart = index === 0 || changes === null;
    let chain = this._chainEnd;
    if (changes !== null && !chainStart) {
      chain ??= this.chainAt(index - 1);
      applyChanges(chain, changes);
      // A keyframe also checks the chain against the live collections, in
      // case something changed them in place since; a delta trusts it.
      chainStart =
        keyframe && !sameCollections(chain, this._host.snapshotRuntime());
    }
    let rt: RuntimeCollections;
    if (chainStart || changes === null) {
      rt = this._host.snapshotRuntime();
      chain = {
        pe: new Set<RecencyEntry>(rt.pe),
        ce: rt.ce.slice(),
        cde: rt.cde.slice(),
      };
    } else {
      rt = changes;
    }
    this._chainEnd = chain;
    this._entries.push({ keyframe, image, body, rt, chainStart });
  }

  /** Full save string for beat `index`, or null if out of range. Strict: does
   *  NOT do Array-style negative indexing (preserves the old `arr[-1] ===
   *  undefined` semantics that callers relied on). */
  getJson(index: number): string | null {
    if (!Number.isInteger(index) || index < 0 || index >= this._entries.length) {
      return null;
    }
    return this.reconstruct(index);
  }

  /** Array-like accessor (supports negative indices like Array.prototype.at).
   *  Used by callers that previously did `checkpoints.at(-1)`. */
  at(index: number): string | null {
    const n = this._entries.length;
    const i = index < 0 ? n + index : index;
    if (i < 0 || i >= n) {
      return null;
    }
    return this.reconstruct(i);
  }

  /** Checkpoint `index`'s image, with its save's module state and runtime
   *  collections, or null if out of range. */
  imageAt(index: number): { image: unknown; save: Record<string, any> } | null {
    const entry = this._entries[index];
    if (!entry) {
      return null;
    }
    const save = JSON.parse(entry.body);
    save["runtime"] = runtimeJson(this.runtimeAt(index));
    return { image: entry.image, save };
  }

  // The runtime collections of entry `index`.
  protected runtimeAt(index: number): RuntimeCollections {
    const chain = this.chainAt(index);
    return { pe: Array.from(chain.pe), ce: chain.ce, cde: chain.cde };
  }

  // The runtime collections of entry `index`: its chain's start's, with the
  // changes of every entry after it up to `index` replayed.
  protected chainAt(index: number): RuntimeChain {
    let base = index;
    while (base > 0 && !this._entries[base]!.chainStart) {
      base--;
    }
    const first = this._entries[base]!;
    const chain: RuntimeChain = {
      pe: new Set<RecencyEntry>(first.rt.pe),
      ce: first.rt.ce.slice(),
      cde: first.rt.cde.slice(),
    };
    for (let i = base + 1; i <= index; i++) {
      applyChanges(chain, this._entries[i]!.rt);
    }
    return chain;
  }

  /** Keep only the first `keepCount` checkpoints (mirrors the old
   *  `_checkpoints.slice(0, keepCount)`). */
  truncate(keepCount: number): void {
    const kept = Math.max(0, Math.min(keepCount, this._entries.length));
    if (kept < this._entries.length) {
      this._chainEnd = null;
    }
    this._entries.length = kept;
  }

  protected reconstruct(index: number): string | null {
    const entry = this._entries[index]!;
    // An image the story can no longer place (a compile emitted again a
    // statement it names) has no save: the caller replays to it, as it does
    // when `restoreCheckpoint` reports it unplaced, rather than load its
    // modules beside a story that stands elsewhere.
    const story = this._host.storyOfImage(entry.image);
    if (story === null) {
      return null;
    }
    // The collections are replayed once, since a chain may be long.
    const save = JSON.parse(entry.body);
    save["story"] = story;
    const rt = this.runtimeAt(index);
    save["runtime"] = runtimeJson({
      ...rt,
      pe: this._host.durableExecuted(rt.pe),
    });
    return JSON.stringify(save);
  }
}

// Replays one entry's runtime-collection changes onto a chain: executed
// positions are a recency-ordered set (delete and add), choices and
// conditions append.
const applyChanges = (chain: RuntimeChain, changes: RuntimeCollections): void => {
  for (const p of changes.pe) {
    chain.pe.delete(p);
    chain.pe.add(p);
  }
  for (const c of changes.ce) {
    chain.ce.push(c);
  }
  for (const c of changes.cde) {
    chain.cde.push(c);
  }
};

// Whether a chain holds what the live collections hold, in their order.
const sameCollections = (chain: RuntimeChain, live: RuntimeCollections): boolean => {
  if (
    chain.pe.size !== live.pe.length ||
    chain.ce.length !== live.ce.length ||
    chain.cde.length !== live.cde.length
  ) {
    return false;
  }
  let i = 0;
  for (const p of chain.pe) {
    if (p !== live.pe[i++]) {
      return false;
    }
  }
  for (let j = 0; j < live.ce.length; j++) {
    const a = chain.ce[j]!;
    const b = live.ce[j]!;
    if (
      a !== b &&
      (a.selected !== b.selected ||
        a.options.length !== b.options.length ||
        a.options.some((o, k) => o !== b.options[k]))
    ) {
      return false;
    }
  }
  for (let j = 0; j < live.cde.length; j++) {
    if (chain.cde[j]!.selected !== live.cde[j]!.selected) {
      return false;
    }
  }
  return true;
};

// The runtime field of a save, as `RuntimeState.toJSON` writes it.
const runtimeJson = (rt: RuntimeCollections): string =>
  JSON.stringify({
    pathsExecutedThisFrame: rt.pe,
    choicesEncountered: rt.ce,
    conditionsEncountered: rt.cde,
  });
