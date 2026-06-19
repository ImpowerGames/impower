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

/** Ordered full / per-beat runtime collections (executed paths, choices,
 *  conditions). */
export interface RuntimeCollections {
  pe: string[];
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

type CheckpointEntry = KeyframeEntry | DeltaEntry;

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
      if (e.kind === "keyframe") {
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

    if (!this._incremental) {
      this._entries.push({ kind: "keyframe", json: this._host.save() });
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

  /** Keep only the first `keepCount` checkpoints (mirrors the old
   *  `_checkpoints.slice(0, keepCount)`). */
  truncate(keepCount: number): void {
    this._entries.length = Math.max(0, Math.min(keepCount, this._entries.length));
  }

  protected reconstruct(index: number): string {
    const entry = this._entries[index]!;
    if (entry.kind === "keyframe") {
      return entry.json;
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
    const pe = new Set<string>(base.rt?.pe ?? []);
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
    saveObj.runtime = JSON.stringify({
      pathsExecutedThisFrame: rt.pe,
      choicesEncountered: rt.ce,
      conditionsEncountered: rt.cde,
    });
    return JSON.stringify(saveObj);
  }
}
