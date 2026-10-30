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
}

interface RuntimeChain {
  pe: Set<RecencyEntry>;
  ce: RuntimeCollections["ce"];
  cde: RuntimeCollections["cde"];
}

export class CheckpointStore {
  protected _entries: ImageEntry[] = [];

  protected _host: CheckpointHost;
  protected _baseInterval: number;

  protected _chainEnd: RuntimeChain | null = null;

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
    this._entries.push({ keyframe, image, body, rt, chainStart });
  }

  getJson(index: number): string | null {
    if (!Number.isInteger(index) || index < 0 || index >= this._entries.length) {
      return null;
    }
    return this.reconstruct(index);
  }

  at(index: number): string | null {
    const n = this._entries.length;
    const i = index < 0 ? n + index : index;
    if (i < 0 || i >= n) {
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
    return { image: entry.image, body: entry.body, runtime: this.runtimeAt(i) };
  }

  imageOf(index: number): unknown {
    return this._entries[index]?.image;
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
    if (!entry) {
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
