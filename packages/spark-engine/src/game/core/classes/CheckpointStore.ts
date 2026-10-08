// Incremental / delta checkpoint storage.
//
// For live preview the engine saves a checkpoint at EVERY beat (so re-planning a
// route can resume from the last valid checkpoint instead of replaying from
// zero). A full save() is dominated by the two UNBOUNDED count maps inside the
// ink story state (visitCounts + turnIndices, keyed by container path, never
// pruned). Storing N full saves of O(N) state each is O(n^2) time + memory.
//
// This store keeps the SAME integer-index contract that the route planner relies
// on (`step.checkpoint` indexes into the store; index i ↔ the full save string
// for the i-th beat) but, when `incremental` is enabled, stores periodic full
// KEYFRAMES (every `baseInterval` beats) plus per-beat DELTAS in between. A delta
// stores the bounded body (everything except the two count maps, full-copied)
// plus only the count-map entries that changed that beat. The full save string
// for any beat is reconstructed lazily by replaying deltas onto the nearest
// keyframe.
//
// SAFETY: with `verify` on, every delta is reconstructed and asserted
// byte-identical to a real full save() at capture time; on ANY mismatch the
// entry falls back to a full keyframe. A subtle delta bug therefore degrades to
// "stored a full save" — never a corrupted one. With `incremental` off the store
// is a thin wrapper over the original `string[]` behavior (every entry a full
// keyframe), so it is a drop-in no-op.
//
// A story that keeps images of its state (the program engine, #699,
// docs/engine/binary-program.md, section 7) is checkpointed by its beats'
// images instead: a keyframe image every `baseInterval` beats and a delta
// image between, which holds the count ids, globals, tables and cells written
// that beat and no JSON, beside the module state and the runtime collections.
// Neither holds the runtime collections whole: they grow with every beat run
// (one executed position or more per beat), so a whole copy in every keyframe
// would make the store quadratic in the beats (#1694). Every image entry, a
// keyframe too, holds the collections' changes since the entry before it, and
// a checkpoint's collections are those changes replayed from the chain's
// start; a keyframe whose live collections differ from that replay (something
// replaced them since) starts a new chain with a whole copy. The module state
// is the save with the story and the collections left out, in a keyframe as
// in a delta. A checkpoint's full save is written from its image when a caller
// asks for it (`getJson`), and a game restores a checkpoint's image in place
// (`imageAt`). Images are deltas by construction, so the store keeps them in
// this way whether or not `incremental` is set, and there is nothing to
// verify against.

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
  /** Full SaveData JSON for the current beat (all collections included). */
  save(): string;
  /** SaveData JSON for the current beat with the unbounded, per-beat-growing
   *  collections (story count maps + runtime collections) emptied. */
  saveDeltaBody(): string;
  /** Full ordered snapshot of both count maps (Map insertion order). */
  snapshotCounts(): {
    vc: [string, number][];
    ti: [string, number][];
  };
  /** Count-map entries changed since the last drain (first-touch order), and
   *  clear the change log. Called once per captured beat. */
  drainCountDeltas(): {
    vc: [string, number][];
    ti: [string, number][];
  };
  /** Full ordered snapshot of the runtime collections. */
  snapshotRuntime(): RuntimeCollections;
  /** Runtime-collection changes since the last drain, and advance the marks. */
  drainRuntime(): RuntimeCollections;
  /** The image of the story's current beat, a keyframe when `keyframe` is
   *  set, when the story keeps images; the store then keeps images. */
  captureImage?(keyframe: boolean): unknown;
  /** SaveData JSON for the current beat with the story left out, and with
   *  the runtime collections emptied when `omitDeltaState` is set. */
  saveWithoutStory?(omitDeltaState: boolean): string;
  /** The story's part of a full save, written from a checkpoint's image, or
   *  null when the image cannot be written by the story as it is now. */
  storyOfImage?(image: unknown): string | null;
  /** The executed positions as a full save written from an image holds
   *  them: each address in its durable form, since the save may load in
   *  another process (#700). */
  durableExecuted?(executed: RecencyEntry[]): RecencyEntry[];
}

interface ImageEntry {
  kind: "image";
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

interface KeyframeEntry {
  kind: "keyframe";
  json: string;
  // Ordered full collections (only populated in incremental mode — needed to
  // seed reconstruction of the deltas that follow this keyframe).
  vc?: [string, number][];
  ti?: [string, number][];
  rt?: RuntimeCollections;
}

interface DeltaEntry {
  kind: "delta";
  // SaveData JSON with the unbounded collections serialized empty.
  body: string;
  // Count-map entries that changed this beat (replayed onto the keyframe).
  vc: [string, number][];
  ti: [string, number][];
  // Runtime-collection changes this beat (replayed onto the keyframe).
  rt: RuntimeCollections;
}

type CheckpointEntry = KeyframeEntry | DeltaEntry | ImageEntry;

export class CheckpointStore {
  protected _entries: CheckpointEntry[] = [];

  protected _host: CheckpointHost;
  protected _incremental: boolean;
  protected _verify: boolean;
  protected _baseInterval: number;

  /** Optional diagnostic callback fired when a delta fails the byte-identical
   *  self-check and falls back to a full keyframe. */
  public onVerifyFallback?: (index: number) => void;

  protected _fallbacks = 0;

  // The runtime collections of the last image entry, as `runtimeAt` replays
  // them, kept up to date as entries are captured so that a keyframe can be
  // compared with them without a replay; null after a truncate, until the
  // next capture replays it again.
  protected _chainEnd: RuntimeChain | null = null;

  /** Introspection for tests/diagnostics: how the N checkpoints are stored. */
  get stats(): {
    total: number;
    keyframes: number;
    deltas: number;
    fallbacks: number;
  } {
    let keyframes = 0;
    let deltas = 0;
    for (const e of this._entries) {
      if (e.kind === "keyframe" || (e.kind === "image" && e.keyframe)) {
        keyframes++;
      } else {
        deltas++;
      }
    }
    return { total: this._entries.length, keyframes, deltas, fallbacks: this._fallbacks };
  }

  constructor(
    host: CheckpointHost,
    options?: {
      incremental?: boolean;
      verify?: boolean;
      baseInterval?: number;
    },
  ) {
    this._host = host;
    this._incremental = options?.incremental ?? false;
    // Self-check defaults ON whenever deltas are enabled — it is the guard that
    // makes a delta bug a fall-back-to-full rather than a silent corruption.
    this._verify = options?.verify ?? true;
    this._baseInterval = Math.max(1, options?.baseInterval ?? 50);
  }

  get length(): number {
    return this._entries.length;
  }

  /** Append a checkpoint capturing the host's CURRENT beat state. */
  capture(): void {
    const index = this._entries.length;

    if (this._host.captureImage) {
      const keyframe = index % this._baseInterval === 0;
      const image = this._host.captureImage(keyframe);
      this._host.drainCountDeltas();
      const changes = this._host.drainRuntime();
      const body = this._host.saveWithoutStory!(true);
      let chainStart = index === 0;
      let chain = this._chainEnd;
      if (!chainStart) {
        chain ??= this.chainAt(index - 1);
        applyChanges(chain, changes);
        // A keyframe checks the chain against the live collections, which
        // something may have replaced since the entry before (a load, a
        // reset); a delta trusts it, as it did when keyframes held them whole.
        chainStart =
          keyframe && !sameCollections(chain, this._host.snapshotRuntime());
      }
      let rt = changes;
      if (chainStart) {
        rt = this._host.snapshotRuntime();
        chain = {
          pe: new Set<RecencyEntry>(rt.pe),
          ce: rt.ce.slice(),
          cde: rt.cde.slice(),
        };
      }
      this._chainEnd = chain;
      this._entries.push({ kind: "image", keyframe, image, body, rt, chainStart });
      return;
    }

    if (!this._incremental) {
      this._entries.push({ kind: "keyframe", json: this._host.save() });
      // Reset the per-beat change logs here too. Nothing consumes them in this
      // mode — the full save above already holds everything — but they mirror
      // collections that otherwise grow for the whole simulation.
      this._host.drainCountDeltas();
      this._host.drainRuntime();
      return;
    }

    const isKeyframeSlot = index % this._baseInterval === 0;
    if (isKeyframeSlot) {
      this._entries.push(this.buildKeyframe());
      return;
    }

    // Delta slot: bounded body + only this beat's changed collection entries.
    const body = this._host.saveDeltaBody();
    const drained = this._host.drainCountDeltas();
    const rt = this._host.drainRuntime();
    const entry: DeltaEntry = {
      kind: "delta",
      body,
      vc: drained.vc,
      ti: drained.ti,
      rt,
    };
    this._entries.push(entry);

    if (this._verify) {
      const reconstructed = this.reconstruct(index);
      const full = this._host.save();
      if (reconstructed !== full) {
        // Self-check failed — fall back to a full keyframe (which also re-seeds
        // the count maps for any deltas that follow). The drain already cleared
        // the change log for this beat, so the keyframe's full snapshot is the
        // authoritative baseline going forward.
        const snap = this._host.snapshotCounts();
        this._entries[index] = {
          kind: "keyframe",
          json: full,
          vc: snap.vc,
          ti: snap.ti,
          rt: this._host.snapshotRuntime(),
        };
        this._fallbacks++;
        this.onVerifyFallback?.(index);
      }
    }
  }

  protected buildKeyframe(): KeyframeEntry {
    const snap = this._host.snapshotCounts();
    const rt = this._host.snapshotRuntime();
    // Drain to reset the per-beat change logs so the deltas after this keyframe
    // start from a clean window (the drained values are already captured by the
    // full snapshots above).
    this._host.drainCountDeltas();
    this._host.drainRuntime();
    return {
      kind: "keyframe",
      json: this._host.save(),
      vc: snap.vc,
      ti: snap.ti,
      rt,
    };
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
   *  collections, when the store keeps images; or null. */
  imageAt(index: number): { image: unknown; save: Record<string, any> } | null {
    const entry = this._entries[index];
    if (!entry || entry.kind !== "image") {
      return null;
    }
    const save = JSON.parse(entry.body);
    save["runtime"] = runtimeJson(this.runtimeAt(index));
    return { image: entry.image, save };
  }

  // The runtime collections of image entry `index`.
  protected runtimeAt(index: number): RuntimeCollections {
    const chain = this.chainAt(index);
    return { pe: Array.from(chain.pe), ce: chain.ce, cde: chain.cde };
  }

  // The runtime collections of image entry `index`: its chain's start's,
  // with the changes of every entry after it up to `index` replayed, as
  // `reconstruct` replays a delta's.
  protected chainAt(index: number): RuntimeChain {
    let base = index;
    while (base > 0 && !(this._entries[base] as ImageEntry).chainStart) {
      base--;
    }
    const first = this._entries[base] as ImageEntry;
    const chain: RuntimeChain = {
      pe: new Set<RecencyEntry>(first.rt.pe),
      ce: first.rt.ce.slice(),
      cde: first.rt.cde.slice(),
    };
    for (let i = base + 1; i <= index; i++) {
      applyChanges(chain, (this._entries[i] as ImageEntry).rt);
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
    if (entry.kind === "keyframe") {
      return entry.json;
    }
    if (entry.kind === "image") {
      // An image the story can no longer place (a compile emitted again a
      // statement it names) has no save: the caller replays to it, as it
      // does when `restoreCheckpoint` reports it unplaced, rather than load
      // its modules beside a story that stands elsewhere.
      const story = this._host.storyOfImage?.(entry.image) ?? null;
      if (story === null) {
        return null;
      }
      // The collections are replayed once, since a chain may be long.
      const save = JSON.parse(entry.body);
      save["story"] = story;
      const rt = this.runtimeAt(index);
      save["runtime"] = runtimeJson(
        this._host.durableExecuted
          ? { ...rt, pe: this._host.durableExecuted(rt.pe) }
          : rt,
      );
      return JSON.stringify(save);
    }

    // Walk back to the nearest keyframe and replay every delta up to `index`
    // onto its count maps.
    let baseIndex = index - 1;
    while (baseIndex >= 0 && this._entries[baseIndex]!.kind !== "keyframe") {
      baseIndex--;
    }
    const base = this._entries[baseIndex] as KeyframeEntry | undefined;
    if (!base) {
      // Should never happen (index 0 is always a keyframe). Defensive: a delta
      // with no keyframe can't be reconstructed.
      throw new Error(
        `CheckpointStore: no keyframe found before delta index ${index}`,
      );
    }

    const vc = new Map<string, number>(base.vc ?? []);
    const ti = new Map<string, number>(base.ti ?? []);
    // Runtime collections: paths are a recency-ordered set (delete+add replay),
    // choices/conditions are append-only (concat).
    const pe = new Set<RecencyEntry>(base.rt?.pe ?? []);
    const ce = (base.rt?.ce ?? []).slice();
    const cde = (base.rt?.cde ?? []).slice();
    for (let i = baseIndex + 1; i <= index; i++) {
      const e = this._entries[i] as DeltaEntry;
      for (const [k, v] of e.vc) {
        vc.set(k, v);
      }
      for (const [k, v] of e.ti) {
        ti.set(k, v);
      }
      for (const p of e.rt.pe) {
        pe.delete(p);
        pe.add(p);
      }
      for (const c of e.rt.ce) {
        ce.push(c);
      }
      for (const c of e.rt.cde) {
        cde.push(c);
      }
    }

    return this.injectCounts(entry.body, vc, ti, { pe: Array.from(pe), ce, cde });
  }

  /** Splice the reconstructed collections back into the body. The story count
   *  maps fill the empty `{}` slots inside the story JSON; the runtime field is
   *  rebuilt wholesale. Both reproduce exactly what the engine serializers wrote
   *  (`JSON.stringify` of plain objects / arrays built in the same order), so
   *  the result is byte-identical to a full save(). */
  protected injectCounts(
    body: string,
    vc: Map<string, number>,
    ti: Map<string, number>,
    rt: RuntimeCollections,
  ): string {
    const saveObj = JSON.parse(body);
    let story = saveObj.story as string;
    story = story.replace(
      '"visitCounts":{}',
      '"visitCounts":' + JSON.stringify(Object.fromEntries(vc)),
    );
    story = story.replace(
      '"turnIndices":{}',
      '"turnIndices":' + JSON.stringify(Object.fromEntries(ti)),
    );
    saveObj.story = story;
    saveObj.runtime = runtimeJson(rt);
    return JSON.stringify(saveObj);
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
