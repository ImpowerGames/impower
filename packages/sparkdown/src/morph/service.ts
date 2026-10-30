import {
  bakeMorphArtifactAsync,
  type MorphBakeInput,
  type MorphGeometryCache,
  type MorphGeometryEntry,
} from "./bake";
import type { MorphArtifact } from "./types";

export interface MorphCacheLimits {
  maxArtifacts: number;
  maxBytes: number;
  maxSources: number;
  maxGeometryPerSource: number;
  maxConcurrentBakes: number;
}

export const MORPH_CACHE_DEFAULTS: MorphCacheLimits = {
  maxArtifacts: 128,
  maxBytes: 8 * 1024 * 1024,
  maxSources: 16,
  maxGeometryPerSource: 512,
  maxConcurrentBakes: 2,
};

export type MorphLoad =
  | { kind: "bake"; input: MorphBakeInput; source: string; uri?: string }
  | { kind: "artifact"; artifact: MorphArtifact; uri?: string };

export interface MorphHandle {
  readonly key: string;
  readonly artifact: MorphArtifact;
  url(which: "rest" | number): string;
  release(): void;
}

export type MorphCacheEvent =
  | { type: "evict"; key: string; reason: "limit" | "invalidated" }
  | { type: "baked"; key: string; milliseconds: number; waitedMilliseconds: number; bytes: number };

interface Entry {
  key: string;
  artifact: MorphArtifact;
  bytes: number;
  refs: number;
  uri?: string;
  source?: string;
  stale: boolean;
  urls: Map<string, string>;
}

interface Waiter {
  resolve(handle: MorphHandle): void;
  reject(error: unknown): void;
  signal?: AbortSignal;
  onAbort?: () => void;
}

interface Flight {
  controller: AbortController;
  waiters: Set<Waiter>;
}

const abortError = (signal?: AbortSignal) =>
  signal?.reason ?? new DOMException("The morph request was cancelled.", "AbortError");

export const morphArtifactBytes = (artifact: MorphArtifact) => JSON.stringify(artifact).length * 2;

export interface MorphBakeServiceOptions {
  limits?: Partial<MorphCacheLimits>;
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
  bake?: (input: MorphBakeInput, options: { signal: AbortSignal; geometry: MorphGeometryCache }) => Promise<MorphArtifact>;
  now?: () => number;
}

export class MorphBakeService {
  readonly limits: MorphCacheLimits;
  protected entries = new Map<string, Entry>();
  protected flights = new Map<string, Flight>();
  protected geometry = new Map<string, Map<string, MorphGeometryEntry>>();
  protected listeners = new Set<(event: MorphCacheEvent) => void>();

  constructor(protected options: MorphBakeServiceOptions = {}) {
    this.limits = { ...MORPH_CACHE_DEFAULTS, ...options.limits };
  }

  request(
    key: string,
    load: (signal: AbortSignal) => Promise<MorphLoad>,
    options: { signal?: AbortSignal } = {},
  ): Promise<MorphHandle> {
    const { signal } = options;
    if (signal?.aborted) return Promise.reject(abortError(signal));
    const cached = this.entries.get(key);
    if (cached && !cached.stale) {
      this.touch(cached);
      return Promise.resolve(this.acquire(cached));
    }
    return new Promise<MorphHandle>((resolve, reject) => {
      const running = this.flights.get(key);
      const flight: Flight =
        running && !running.controller.signal.aborted
          ? running
          : { controller: new AbortController(), waiters: new Set() };
      const joined = flight === running;
      const waiter: Waiter = { resolve, reject, ...(signal ? { signal } : {}) };
      if (signal) {
        waiter.onAbort = () => {
          if (!flight.waiters.delete(waiter)) return;
          reject(abortError(signal));
          if (flight.waiters.size === 0) flight.controller.abort(abortError(signal));
        };
        signal.addEventListener("abort", waiter.onAbort, { once: true });
      }
      flight.waiters.add(waiter);
      if (joined) return;
      this.flights.set(key, flight);
      void this.run(key, flight, load);
    });
  }

  protected async run(key: string, flight: Flight, load: (signal: AbortSignal) => Promise<MorphLoad>) {
    const signal = flight.controller.signal;
    const started = (this.options.now ?? (() => performance.now()))();
    let entry: Entry | undefined;
    let failure: unknown;
    try {
      const loaded = await load(signal);
      signal.throwIfAborted();
      let artifact: MorphArtifact;
      let baking = started;
      if (loaded.kind === "artifact") {
        artifact = loaded.artifact;
      } else {
        const release = await this.bakeSlot(signal);
        baking = (this.options.now ?? (() => performance.now()))();
        try {
          const geometry = this.geometryFor(loaded.source);
          artifact = this.options.bake
            ? await this.options.bake(loaded.input, { signal, geometry })
            : await bakeMorphArtifactAsync(loaded.input, { signal, geometry });
        } finally {
          release();
        }
      }
      signal.throwIfAborted();
      entry = {
        key,
        artifact,
        bytes: morphArtifactBytes(artifact),
        refs: 0,
        ...(loaded.uri === undefined ? {} : { uri: loaded.uri }),
        ...(loaded.kind === "bake" ? { source: loaded.source } : {}),
        stale: false,
        urls: new Map(),
      };
      const now = (this.options.now ?? (() => performance.now()))();
      this.emit({ type: "baked", key, milliseconds: now - baking, waitedMilliseconds: baking - started, bytes: entry.bytes });
    } catch (error) {
      failure = error;
    }
    if (this.flights.get(key) === flight) this.flights.delete(key);
    const waiters = [...flight.waiters];
    flight.waiters.clear();
    for (const waiter of waiters) {
      if (waiter.signal && waiter.onAbort) waiter.signal.removeEventListener("abort", waiter.onAbort);
    }
    if (!entry) {
      for (const waiter of waiters) waiter.reject(failure);
      return;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    for (const waiter of waiters) waiter.resolve(this.acquire(entry));
    this.trim();
  }

  protected baking = 0;
  protected bakeQueue: (() => void)[] = [];

  protected bakeSlot(signal: AbortSignal): Promise<() => void> {
    const take = (): (() => void) => {
      this.baking += 1;
      let given = false;
      return () => {
        if (given) return;
        given = true;
        this.baking -= 1;
        this.bakeQueue.shift()?.();
      };
    };
    if (this.baking < Math.max(1, this.limits.maxConcurrentBakes)) return Promise.resolve(take());
    return new Promise((resolve, reject) => {
      const turn = () => {
        signal.removeEventListener("abort", onAbort);
        resolve(take());
      };
      const onAbort = () => {
        const at = this.bakeQueue.indexOf(turn);
        if (at >= 0) this.bakeQueue.splice(at, 1);
        reject(abortError(signal));
      };
      signal.addEventListener("abort", onAbort, { once: true });
      this.bakeQueue.push(turn);
    });
  }

  protected acquire(entry: Entry): MorphHandle {
    entry.refs += 1;
    let released = false;
    return {
      key: entry.key,
      artifact: entry.artifact,
      url: (which) => this.urlFor(entry, which),
      release: () => {
        if (released) return;
        released = true;
        entry.refs -= 1;
        if (entry.refs === 0 && entry.stale) this.drop(entry, "invalidated");
        else this.trim();
      },
    };
  }

  protected urlFor(entry: Entry, which: "rest" | number): string {
    const name = String(which);
    const existing = entry.urls.get(name);
    if (existing) return existing;
    const create = this.options.createObjectURL;
    if (!create) throw new Error("This morph service has no createObjectURL.");
    const svg = which === "rest" ? entry.artifact.rest : entry.artifact.parts[which]?.svg;
    if (svg === undefined) throw new RangeError(`The artifact has no part ${name}.`);
    const url = create(new Blob([svg], { type: "image/svg+xml" }));
    entry.urls.set(name, url);
    return url;
  }

  protected touch(entry: Entry) {
    this.entries.delete(entry.key);
    this.entries.set(entry.key, entry);
  }

  protected drop(entry: Entry, reason: "limit" | "invalidated") {
    if (this.entries.get(entry.key) === entry) this.entries.delete(entry.key);
    for (const url of entry.urls.values()) this.options.revokeObjectURL?.(url);
    entry.urls.clear();
    this.emit({ type: "evict", key: entry.key, reason });
  }

  protected trim() {
    let bytes = 0;
    for (const entry of this.entries.values()) if (entry.refs === 0) bytes += entry.bytes;
    for (const entry of [...this.entries.values()]) {
      if (this.entries.size <= this.limits.maxArtifacts && bytes <= this.limits.maxBytes) break;
      if (entry.refs > 0) continue;
      bytes -= entry.bytes;
      this.drop(entry, "limit");
    }
  }

  protected geometryFor(source: string): MorphGeometryCache {
    let pairs = this.geometry.get(source);
    if (pairs) {
      this.geometry.delete(source);
    } else {
      pairs = new Map();
    }
    this.geometry.set(source, pairs);
    while (this.geometry.size > this.limits.maxSources) {
      this.geometry.delete(this.geometry.keys().next().value!);
    }
    const limit = this.limits.maxGeometryPerSource;
    const store = pairs;
    return {
      get: (key) => store.get(key),
      set: (key, morph) => {
        store.set(key, morph);
        while (store.size > limit) store.delete(store.keys().next().value!);
      },
    };
  }

  invalidate(match: (entry: { key: string; uri?: string; source?: string }) => boolean) {
    for (const entry of [...this.entries.values()]) {
      if (!match(entry)) continue;
      entry.stale = true;
      if (entry.source) this.geometry.delete(entry.source);
      if (entry.refs === 0) this.drop(entry, "invalidated");
    }
  }

  onEvent(listener: (event: MorphCacheEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  protected emit(event: MorphCacheEvent) {
    for (const listener of this.listeners) listener(event);
  }

  stats() {
    let bytes = 0;
    let referenced = 0;
    let urls = 0;
    for (const entry of this.entries.values()) {
      bytes += entry.bytes;
      if (entry.refs > 0) referenced += 1;
      urls += entry.urls.size;
    }
    return {
      artifacts: this.entries.size,
      bytes,
      referenced,
      urls,
      inFlight: this.flights.size,
      sources: this.geometry.size,
    };
  }
}
