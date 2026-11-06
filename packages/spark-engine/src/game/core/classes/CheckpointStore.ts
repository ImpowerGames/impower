import type { RecencyEntry } from "./RecencySet";

export interface RuntimeCollections {
  pe: RecencyEntry[];
  ce: { options: string[]; selected: number }[];
  cde: { selected: boolean }[];
}

export interface CheckpointHost {
  snapshotRuntime(): RuntimeCollections;
  drainRuntime(): RuntimeCollections | null;
  captureImage(keyframe: boolean): unknown;
  saveWithoutStory(): string;
  storyOfImage(image: unknown): string | null;
  durableExecuted(executed: RecencyEntry[]): RecencyEntry[];
  imageParts(image: unknown): ImageParts;
  valueParts(value: unknown): ValueParts;
}

export interface ImageParts {
  bytes: number;
  roots: readonly unknown[];
  refs: readonly unknown[];
}

export interface ValueParts {
  bytes: number;
  children: readonly unknown[];
}


export interface StoredCheckpoint {
  readonly image: unknown;
  readonly body: string;
  readonly runtime: RuntimeCollections;
}

interface ImageEntry {
  keyframe: boolean;
  image: unknown;
  body: string;
  rt: RuntimeCollections;
  chainStart: boolean;
  bytes: number;
  folded: boolean;
  pins: number[];
  pinnedBy: number;
  roots: readonly unknown[];
}

interface RuntimeChain {
  pe: Set<RecencyEntry>;
  ce: RuntimeCollections["ce"];
  cde: RuntimeCollections["cde"];
}

const ENTRY_BYTES = 96;
const SLOT_BYTES = 8;
const RECORD_BYTES = 32;

const NO_RUNTIME: RuntimeCollections = { pe: [], ce: [], cde: [] };

const FOLDED: ImageEntry = {
  keyframe: false,
  image: null,
  body: "",
  rt: NO_RUNTIME,
  chainStart: false,
  bytes: 0,
  folded: true,
  pins: [],
  pinnedBy: 0,
  roots: [],
};

export class CheckpointStore {
  protected _entries: ImageEntry[] = [];

  protected _host: CheckpointHost;
  protected _baseInterval: number;

  protected _chainEnd: RuntimeChain | null = null;

  protected _bytes = 0;
  get bytes(): number {
    if (this._valuesStale || this._sinceRemark >= this._baseInterval) {
      this.remark();
    }
    return this._bytes + this._valueBytes;
  }

  protected _valuesStale = false;

  protected _sinceRemark = 0;

  protected _valueBytes = 0;

  protected _marked = new Set<unknown>();

  protected _holders = new Map<unknown, number>();


  protected _foldExhaustedAt = -1;

  get stats(): {
    total: number;
    keyframes: number;
    deltas: number;
    folded: number;
  } {
    let keyframes = 0;
    let folded = 0;
    for (const e of this._entries) {
      if (e.folded) {
        folded++;
      } else if (e.keyframe) {
        keyframes++;
      }
    }
    const total = this._entries.length;
    return { total, keyframes, deltas: total - keyframes - folded, folded };
  }

  constructor(host: CheckpointHost, options?: { baseInterval?: number }) {
    this._host = host;
    this._baseInterval = Math.max(1, options?.baseInterval ?? 50);
  }

  get length(): number {
    return this._entries.length;
  }

  capture(): void {
    const index = this._entries.length;
    const keyframe = index % this._baseInterval === 0;
    const image = this._host.captureImage(keyframe);
    const changes = this._host.drainRuntime();
    const body = this._host.saveWithoutStory();
    let chainStart = index === 0 || changes === null;
    let chain = this._chainEnd;
    if (changes !== null && !chainStart) {
      chain ??= this.chainAt(index - 1);
      applyChanges(chain, changes);
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
    const holder = this._holders.get(image);
    const pins = new Set<number>();
    let bytes = ENTRY_BYTES + body.length * 2 + runtimeBytes(rt);
    let roots: readonly unknown[] = [];
    if (holder !== undefined) {
      pins.add(holder);
    } else {
      const parts = this._host.imageParts(image);
      bytes += parts.bytes;
      roots = parts.roots;
      for (const ref of parts.refs) {
        const at = this._holders.get(ref);
        if (at !== undefined) {
          pins.add(at);
        }
      }
      this._holders.set(image, index);
    }
    for (const at of pins) {
      this._entries[at]!.pinnedBy += 1;
    }
    this._bytes += bytes;
    this._entries.push({
      keyframe,
      image,
      body,
      rt,
      chainStart,
      bytes,
      folded: false,
      pins: [...pins],
      pinnedBy: 0,
      roots,
    });
    if (!this._valuesStale) {
      this.mark(roots);
    }
    this._sinceRemark += 1;
  }

  protected mark(roots: readonly unknown[]): void {
    const pending = [...roots];
    while (pending.length > 0) {
      const value = pending.pop();
      if (this._marked.has(value)) {
        continue;
      }
      this._marked.add(value);
      const parts = this._host.valueParts(value);
      this._valueBytes += parts.bytes;
      for (const child of parts.children) {
        if (!this._marked.has(child)) {
          pending.push(child);
        }
      }
    }
  }

  protected remark(): void {
    this._marked = new Set();
    this._valueBytes = 0;
    this._valuesStale = false;
    this._sinceRemark = 0;
    for (const entry of this._entries) {
      if (!entry.folded) {
        this.mark(entry.roots);
      }
    }
  }

  charge(index: number, bytes: number): void {
    const entry = this._entries[index];
    if (entry && !entry.folded) {
      entry.bytes += bytes;
      this._bytes += bytes;
    }
  }

  isFolded(index: number): boolean {
    return this._entries[index]?.folded ?? false;
  }

  fold(budget: number, keep: number): number[] {
    const folded: number[] = [];
    if (this.bytes <= budget) {
      return folded;
    }
    let newest = this._entries.length - 1;
    while (newest > 0 && !this._entries[newest]!.keyframe) {
      newest--;
    }
    if (newest === this._foldExhaustedAt) {
      return folded;
    }
    const first = Math.max(0, keep + 1);
    const foldAt = (i: number): boolean => {
      const entry = this._entries[i]!;
      if (entry.folded || entry.pinnedBy > 0) {
        return false;
      }
      let next = i + 1;
      while (this._entries[next]!.folded) {
        next++;
      }
      this.startChainAt(next);
      this.release(i);
      this._entries[i] = { ...FOLDED };
      folded.push(i);
      return true;
    };
    let progress = true;
    while (progress && this.bytes > budget) {
      progress = false;
      let from = first;
      while (from < newest && this.bytes > budget) {
        let next = from;
        while (next < newest && !this._entries[next]!.keyframe) {
          next++;
        }
        let segment = false;
        for (let i = next - 1; i >= from; i--) {
          segment = foldAt(i) || segment;
        }
        if (segment) {
          this.remark();
          progress = true;
        }
        from = next + 1;
      }
      for (let i = first; i < newest && this.bytes > budget; i++) {
        if (this._entries[i]!.keyframe && foldAt(i)) {
          this.remark();
          progress = true;
        }
      }
    }
    if (this.bytes > budget) {
      this._foldExhaustedAt = newest;
    }
    return folded;
  }

  protected release(index: number): void {
    const entry = this._entries[index]!;
    this._bytes -= entry.bytes;
    for (const at of entry.pins) {
      const pinned = this._entries[at];
      if (pinned) {
        pinned.pinnedBy -= 1;
      }
    }
    if (this._holders.get(entry.image) === index) {
      this._holders.delete(entry.image);
    }
  }

  protected startChainAt(index: number): void {
    const entry = this._entries[index]!;
    if (entry.chainStart) {
      return;
    }
    const rt = this.runtimeAt(index);
    const was = runtimeBytes(entry.rt);
    entry.rt = { pe: rt.pe, ce: rt.ce.slice(), cde: rt.cde.slice() };
    entry.chainStart = true;
    const now = runtimeBytes(entry.rt);
    entry.bytes += now - was;
    this._bytes += now - was;
  }

  getJson(index: number): string | null {
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= this._entries.length ||
      this._entries[index]!.folded
    ) {
      return null;
    }
    return this.reconstruct(index);
  }

  at(index: number): string | null {
    const n = this._entries.length;
    const i = index < 0 ? n + index : index;
    if (i < 0 || i >= n || this._entries[i]!.folded) {
      return null;
    }
    return this.reconstruct(i);
  }

  checkpointAt(index: number): StoredCheckpoint | null {
    const n = this._entries.length;
    const i = index < 0 ? n + index : index;
    if (!Number.isInteger(i) || i < 0 || i >= n) {
      return null;
    }
    const entry = this._entries[i]!;
    if (entry.folded) {
      return null;
    }
    return { image: entry.image, body: entry.body, runtime: this.runtimeAt(i) };
  }

  imageOf(index: number): unknown {
    const entry = this._entries[index];
    return entry && !entry.folded ? entry.image : undefined;
  }

  jsonOf(checkpoint: StoredCheckpoint): string | null {
    const story = this._host.storyOfImage(checkpoint.image);
    if (story === null) {
      return null;
    }
    const save = JSON.parse(checkpoint.body);
    save["story"] = story;
    const rt = checkpoint.runtime;
    save["runtime"] = runtimeJson({
      ...rt,
      pe: this._host.durableExecuted(rt.pe),
    });
    return JSON.stringify(save);
  }

  imageAt(index: number): { image: unknown; save: Record<string, any> } | null {
    const entry = this._entries[index];
    if (!entry || entry.folded) {
      return null;
    }
    const save = JSON.parse(entry.body);
    save["runtime"] = runtimeJson(this.runtimeAt(index));
    return { image: entry.image, save };
  }

  protected runtimeAt(index: number): RuntimeCollections {
    const chain = this.chainAt(index);
    return { pe: Array.from(chain.pe), ce: chain.ce, cde: chain.cde };
  }

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

  truncate(keepCount: number): void {
    const kept = Math.max(0, Math.min(keepCount, this._entries.length));
    if (kept < this._entries.length) {
      this._chainEnd = null;
      this._foldExhaustedAt = -1;
      this._valuesStale = true;
    }
    for (let i = this._entries.length - 1; i >= kept; i--) {
      this.release(i);
    }
    this._entries.length = kept;
  }

  protected reconstruct(index: number): string | null {
    const entry = this._entries[index]!;
    const replay = () => this.runtimeAt(index);
    return this.jsonOf({
      image: entry.image,
      body: entry.body,
      get runtime() {
        return replay();
      },
    });
  }
}

const runtimeBytes = (rt: RuntimeCollections): number => {
  let bytes = SLOT_BYTES * rt.pe.length + SLOT_BYTES * 2 * rt.cde.length;
  for (const c of rt.ce) {
    bytes += RECORD_BYTES + SLOT_BYTES * c.options.length;
  }
  return bytes;
};

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

const runtimeJson = (rt: RuntimeCollections): string =>
  JSON.stringify({
    pathsExecutedThisFrame: rt.pe,
    choicesEncountered: rt.ce,
    conditionsEncountered: rt.cde,
  });
