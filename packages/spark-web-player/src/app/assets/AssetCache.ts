import { type LoadAudioPlayerParams } from "../../../../spark-engine/src/game/modules/audio/types/LoadAudioPlayerParams";
import {
  assetItemKey,
  type AssetItem,
  type AssetPriority,
} from "../../../../spark-engine/src/game/modules/assets/types/AssetItem";
import { type AssetsProgressParams } from "../../../../spark-engine/src/game/modules/assets/types/AssetsProgressParams";
import { type LoadAssetsResult } from "../../../../spark-engine/src/game/modules/assets/types/LoadAssetsResult";

/**
 * The slice of `HTMLImageElement` a load needs, so tests can pass a fake and
 * this file stays runnable outside a DOM.
 */
export interface ImageTarget {
  src: string;
  onload: ((this: any, ev: any) => any) | null;
  onerror: ((this: any, ev: any) => any) | null;
  naturalWidth?: number;
  naturalHeight?: number;
  decode?: () => Promise<void>;
}

/** The slice of `FontFace` a load needs. */
export interface FontFaceLike {
  family: string;
  load?: () => Promise<unknown>;
}

export interface FontDescriptors {
  weight?: string;
  style?: string;
  stretch?: string;
  display?: string;
  unicodeRange?: string;
}

/** Everything the cache reaches into the platform for, injectable so tests
 *  run without a browser and the real page passes the real APIs. A missing
 *  capability makes that kind resident without loading anything (jsdom has
 *  no fonts, no fetch, no audio). */
export interface AssetCacheDeps {
  createImage: () => ImageTarget;
  decodeAudio?: (params: LoadAudioPlayerParams) => Promise<AudioBuffer | null>;
  fetchBytes?: (src: string) => Promise<{ bytes: ArrayBuffer; type: string }>;
  createFontFace?: (
    family: string,
    source: ArrayBuffer,
    descriptors: FontDescriptors,
  ) => FontFaceLike;
  fonts?: { add(face: FontFaceLike): unknown; delete(face: FontFaceLike): unknown };
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
  /** Wall-clock milliseconds, for the failed-item cool-down. */
  now?: () => number;
}

export interface AssetCacheOptions {
  /** Requests in flight at once. Assets are served by a service worker that
   *  reads OPFS (and, in the cross-origin player, round-trips through the
   *  editor), so an unbounded burst puts every asset behind every other one:
   *  warming 261 images at project open still left the first portrait cold
   *  (#344). */
  maxConcurrent?: number;
  /** Slots only priority 0 (a gate) may use, so a gate never waits behind a
   *  full window of background prefetches. */
  expressSlots?: number;
  /** Bytes of resident assets to keep before evicting; 0 = never evict. */
  cacheBytes?: number;
  /** How long to wait for `img.decode()` before counting a loaded image
   *  resident anyway. Decoding ahead is an optimization; some browsers never
   *  settle the promise for an image that is not in the document. */
  decodeTimeoutMs?: number;
}

export const DEFAULT_DECODE_TIMEOUT_MS = 1500;

export const DEFAULT_MAX_CONCURRENT = 6;
export const DEFAULT_EXPRESS_SLOTS = 2;
/** How many times one item may fail before the cache stops retrying it. On a
 *  first visit the service worker may not be controlling the page yet, so an
 *  early load can 404 across the board; giving up at once would strand the
 *  whole project cold for the session, and never giving up would keep a
 *  missing file in the queue for ever. */
export const MAX_LOAD_ATTEMPTS = 3;
/** How long an item that used up its attempts stays failed before a new
 *  request for it gets a fresh set. A first visit can 404 the whole project
 *  faster than the service worker (or the dev server's fallback mirror) comes
 *  up; the file has not changed, so nothing would otherwise ever retry it. */
export const FAILED_RETRY_COOLDOWN_MS = 5000;

const KIB = 1024;
const MIB = 1024 * KIB;
/** Below this an image's pixel estimate is not worth trusting. */
const MIN_IMAGE_BYTES = 256 * KIB;
/** An SVG's intrinsic size says little about what it costs to rasterize. */
const MIN_SVG_BYTES = 4 * MIB;

type EntryState = "queued" | "loading" | "resident" | "failed";

interface Entry {
  key: string;
  item: AssetItem;
  /** The file behind the item: its src without query, so every variant of one
   *  file can be found when the file changes. */
  file: string;
  state: EntryState;
  priority: AssetPriority;
  pins: Set<string>;
  bytes: number;
  lastUsed: number;
  attempts: number;
  /** When the entry used up its attempts; a request after the cool-down
   *  starts it over. */
  failedAt: number;
  /** Set when the entry was removed while loading, so its completion is
   *  ignored rather than resurrecting it. */
  stale: boolean;
  image?: ImageTarget;
  font?: FontFaceLike;
  audio?: AudioBuffer;
  videoUrl?: string;
  waiters: Array<() => void>;
}

interface Tracked {
  pin: string;
  keys: string[];
}

const fileOf = (item: AssetItem): string => {
  const src = item.kind === "audio" ? (item.params.src ?? "") : item.src;
  return src.split("?")[0] ?? "";
};

const isSvg = (item: AssetItem): boolean =>
  item.kind === "image" &&
  (/\.svg(\?|$)/i.test(item.src) || item.src.includes("filters="));

/**
 * What the page keeps resident and how much of it (docs/engine/asset-preloading-spec.md).
 *
 * Keyed by `assetItemKey`. Every request settles: an item either becomes
 * resident (decoded, or its face added, or its bytes held) or fails after its
 * retries, and the requester hears either way. Pinned entries never evict;
 * the rest go least-recently-used first once `cacheBytes` is exceeded, except
 * what the page reports as displayed or playing.
 */
export class AssetCache {
  protected _entries = new Map<string, Entry>();

  protected _queues: Entry[][] = [[], [], [], []];

  protected _inFlight = 0;

  protected _inFlightBackground = 0;

  protected _pumping = false;

  protected _tick = 1;

  protected _bytes = 0;

  protected _maxConcurrent: number;

  protected _expressSlots: number;

  protected _cacheBytes: number;

  protected _decodeTimeoutMs: number;

  protected _derivedPins: () => Iterable<string> = () => [];

  protected _tracked = new Map<string, Tracked>();

  protected _progressListeners = new Set<(p: AssetsProgressParams) => void>();

  constructor(
    protected _deps: AssetCacheDeps,
    options: AssetCacheOptions = {},
  ) {
    // A cap of 0 (or NaN, from a `??`-defaulted config) would leave the pump
    // unable to start anything and the queue growing silently for ever.
    this._maxConcurrent = Math.max(
      1,
      Math.floor(options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT) || 1,
    );
    this._expressSlots = Math.min(
      this._maxConcurrent - 1,
      Math.max(0, Math.floor(options.expressSlots ?? DEFAULT_EXPRESS_SLOTS) || 0),
    );
    this._cacheBytes = Math.max(0, options.cacheBytes ?? 0);
    this._decodeTimeoutMs = Math.max(
      0,
      options.decodeTimeoutMs ?? DEFAULT_DECODE_TIMEOUT_MS,
    );
  }

  get cacheBytes() {
    return this._cacheBytes;
  }

  protected now(): number {
    return this._deps.now ? this._deps.now() : Date.now();
  }

  get bytes() {
    return this._bytes;
  }

  get inFlightCount() {
    return this._inFlight;
  }

  get queuedCount() {
    return this._queues.reduce((n, q) => n + q.length, 0);
  }

  get residentCount() {
    let n = 0;
    for (const e of this._entries.values()) {
      if (e.state === "resident") {
        n++;
      }
    }
    return n;
  }

  get failedCount() {
    let n = 0;
    for (const e of this._entries.values()) {
      if (e.state === "failed") {
        n++;
      }
    }
    return n;
  }

  configure(options: { cacheBytes?: number }): void {
    if (options.cacheBytes != null && Number.isFinite(options.cacheBytes)) {
      this._cacheBytes = Math.max(0, options.cacheBytes);
      this.maybeEvict();
    }
  }

  setAudioDecoder(
    decode: ((params: LoadAudioPlayerParams) => Promise<AudioBuffer | null>) | undefined,
  ): void {
    this._deps = { ...this._deps, decodeAudio: decode };
  }

  /** Keys the page itself keeps alive: what is displayed or playing. */
  setDerivedPins(provider: () => Iterable<string>): void {
    this._derivedPins = provider;
  }

  onProgress(listener: (p: AssetsProgressParams) => void): () => void {
    this._progressListeners.add(listener);
    return () => {
      this._progressListeners.delete(listener);
    };
  }

  isResident(key: string): boolean {
    return this._entries.get(key)?.state === "resident";
  }

  has(key: string): boolean {
    return this._entries.has(key);
  }

  stateOf(key: string): EntryState | undefined {
    return this._entries.get(key)?.state;
  }

  pinsOf(key: string): string[] {
    return [...(this._entries.get(key)?.pins ?? [])];
  }

  getImage(src: string): ImageTarget | undefined {
    const e = this._entries.get(src);
    return e?.state === "resident" ? e.image : undefined;
  }

  getAudio(key: string): AudioBuffer | undefined {
    const e = this._entries.get(key);
    return e?.state === "resident" ? e.audio : undefined;
  }

  getVideoUrl(src: string): string | undefined {
    const e = this._entries.get(src);
    return e?.state === "resident" ? e.videoUrl : undefined;
  }

  /** Mark a key as used now, so eviction passes it over this round. */
  touch(key: string): void {
    const e = this._entries.get(key);
    if (e) {
      e.lastUsed = this._tick;
    }
  }

  /** Start a new round: what was touched before it becomes evictable. Called
   *  by every request and prefetch, so rounds advance with the story rather
   *  than with a clock (a preview has no running clock). */
  tick(): void {
    this._tick++;
  }

  /**
   * Make items resident under `pin`, in order, and settle once every one has
   * loaded or failed. Pins are kept for the loaded items in order while the
   * pinned total stays under `pinBudget` (default: the cache size; 0 = no
   * limit); the rest stay resident but unpinned.
   */
  request(
    items: AssetItem[],
    priority: AssetPriority,
    pin: string,
    pinBudget?: number,
  ): Promise<LoadAssetsResult> {
    this.tick();
    const entries: Entry[] = [];
    const seen = new Set<string>();
    for (const item of items) {
      const entry = this.ensure(item, priority);
      if (!entry || seen.has(entry.key)) {
        continue;
      }
      seen.add(entry.key);
      entry.pins.add(pin);
      entries.push(entry);
    }
    this._tracked.set(pin, { pin, keys: entries.map((e) => e.key) });
    this.emitProgress(pin);
    const budget =
      pinBudget != null && pinBudget > 0
        ? pinBudget
        : this._cacheBytes > 0
          ? this._cacheBytes
          : Number.POSITIVE_INFINITY;
    const settle = (): LoadAssetsResult => {
      const loaded: string[] = [];
      const failed: string[] = [];
      const pinned: string[] = [];
      let pinnedBytes = this.pinnedBytesExcept(pin);
      for (const e of entries) {
        if (e.state === "resident") {
          loaded.push(e.key);
          if (pinnedBytes + e.bytes <= budget) {
            pinnedBytes += e.bytes;
            pinned.push(e.key);
          } else {
            e.pins.delete(pin);
          }
        } else {
          failed.push(e.key);
          e.pins.delete(pin);
        }
      }
      this.maybeEvict();
      return { loaded, failed, pinned };
    };
    const pending = entries.filter(
      (e) => e.state !== "resident" && e.state !== "failed",
    );
    if (pending.length === 0) {
      return Promise.resolve(settle());
    }
    return new Promise((resolve) => {
      let remaining = pending.length;
      for (const e of pending) {
        e.waiters.push(() => {
          remaining--;
          this.emitProgress(pin);
          if (remaining === 0) {
            resolve(settle());
          }
        });
      }
      this.pump();
    });
  }

  /** Load items in the background, unpinned. */
  prefetch(items: AssetItem[], priority: AssetPriority): void {
    this.tick();
    for (const item of items) {
      this.ensure(item, priority);
    }
    this.pump();
  }

  /** Let go of pins; with `drop`, evict at once whatever they leave unpinned
   *  unless the page still displays or plays it. A queued item left unpinned
   *  by a drop is cancelled rather than loaded for nothing. */
  release(pins: string[], drop: boolean): void {
    const set = new Set(pins);
    for (const pin of pins) {
      this._tracked.delete(pin);
    }
    const derived = drop ? new Set(this._derivedPins()) : null;
    for (const e of [...this._entries.values()]) {
      let touched = false;
      for (const pin of set) {
        if (e.pins.delete(pin)) {
          touched = true;
        }
      }
      if (!touched || !drop || e.pins.size > 0 || derived!.has(e.key)) {
        continue;
      }
      if (e.state === "queued") {
        this.dequeue(e);
        this.remove(e);
        for (const w of e.waiters.splice(0)) {
          w();
        }
      } else if (e.state === "resident" || e.state === "failed") {
        this.remove(e);
      }
    }
  }

  /** Forget every entry of one file (every variant url of an image, the
   *  audio that plays it), including any failure record: the file changed,
   *  so the old bytes say nothing about the new ones. */
  evictFile(src: string | null | undefined): void {
    if (!src) {
      return;
    }
    const file = src.split("?")[0];
    for (const e of [...this._entries.values()]) {
      if (e.file !== file) {
        continue;
      }
      if (e.state === "queued") {
        this.dequeue(e);
      }
      this.remove(e);
      for (const w of e.waiters.splice(0)) {
        w();
      }
    }
  }

  stats() {
    const bytes = { image: 0, font: 0, audio: 0, video: 0, total: 0 };
    let resident = 0;
    let loading = 0;
    let failed = 0;
    const pins = new Set<string>();
    for (const e of this._entries.values()) {
      if (e.state === "resident") {
        resident++;
        bytes[e.item.kind] += e.bytes;
        bytes.total += e.bytes;
      } else if (e.state === "loading") {
        loading++;
      } else if (e.state === "failed") {
        failed++;
      }
      for (const pin of e.pins) {
        pins.add(pin);
      }
    }
    return {
      resident,
      loading,
      queued: this.queuedCount,
      failed,
      bytes,
      cacheBytes: this._cacheBytes,
      pins: [...pins].sort(),
      keys: [...this._entries.keys()],
    };
  }

  /** Release what the platform holds for every entry. */
  dispose(): void {
    for (const e of [...this._entries.values()]) {
      if (e.state === "queued") {
        this.dequeue(e);
      }
      this.remove(e);
    }
    this._tracked.clear();
  }

  // ---------------------------------------------------------------------------

  protected ensure(item: AssetItem, priority: AssetPriority): Entry | null {
    const key = assetItemKey(item);
    if (!key || (item.kind !== "audio" && item.src.startsWith("data:"))) {
      // Nothing to fetch, and nothing worth holding a second decoded copy of.
      return null;
    }
    let entry = this._entries.get(key);
    if (entry) {
      entry.lastUsed = this._tick;
      if (entry.state === "queued" && priority < entry.priority) {
        // Asked for sooner than it was queued: move it up.
        this.dequeue(entry);
        entry.priority = priority;
        this._queues[priority]!.push(entry);
      } else if (
        entry.state === "failed" &&
        this.now() - entry.failedAt >= FAILED_RETRY_COOLDOWN_MS
      ) {
        // Long enough ago that whatever was wrong may have been fixed.
        entry.state = "queued";
        entry.attempts = 0;
        entry.priority = priority;
        this._queues[priority]!.push(entry);
      }
      return entry;
    }
    entry = {
      key,
      item,
      file: fileOf(item),
      state: "queued",
      priority,
      pins: new Set(),
      bytes: 0,
      lastUsed: this._tick,
      attempts: 0,
      failedAt: 0,
      stale: false,
      waiters: [],
    };
    this._entries.set(key, entry);
    this._queues[priority]!.push(entry);
    return entry;
  }

  protected dequeue(entry: Entry): void {
    const queue = this._queues[entry.priority]!;
    const index = queue.indexOf(entry);
    if (index >= 0) {
      queue.splice(index, 1);
    }
  }

  protected remove(entry: Entry): void {
    if (entry.state === "loading") {
      entry.stale = true;
    }
    if (entry.state === "resident") {
      this._bytes -= entry.bytes;
      this.releasePlatform(entry);
    }
    this._entries.delete(entry.key);
  }

  protected releasePlatform(entry: Entry): void {
    if (entry.font) {
      try {
        this._deps.fonts?.delete(entry.font);
      } catch {
        // A face the platform no longer knows is already gone.
      }
    }
    if (entry.videoUrl) {
      this._deps.revokeObjectURL?.(entry.videoUrl);
    }
    entry.image = undefined;
    entry.font = undefined;
    entry.audio = undefined;
    entry.videoUrl = undefined;
  }

  protected pinnedBytesExcept(pin: string): number {
    let total = 0;
    for (const e of this._entries.values()) {
      if (e.state !== "resident" || e.pins.size === 0) {
        continue;
      }
      if (e.pins.size === 1 && e.pins.has(pin)) {
        continue;
      }
      total += e.bytes;
    }
    return total;
  }

  protected emitProgress(pin: string): void {
    const tracked = this._tracked.get(pin);
    if (!tracked || this._progressListeners.size === 0) {
      return;
    }
    let loaded = 0;
    let failed = 0;
    for (const key of tracked.keys) {
      const state = this._entries.get(key)?.state;
      if (state === "resident") {
        loaded++;
      } else if (state === "failed" || state === undefined) {
        failed++;
      }
    }
    const params = { pin, loaded, failed, total: tracked.keys.length };
    for (const listener of this._progressListeners) {
      listener(params);
    }
  }

  protected canStart(priority: AssetPriority): boolean {
    if (this._inFlight >= this._maxConcurrent) {
      return false;
    }
    if (priority === 0) {
      return true;
    }
    return this._inFlightBackground < this._maxConcurrent - this._expressSlots;
  }

  protected pump(): void {
    // A load that settles synchronously (a fake in tests, a same-tick cache
    // hit) calls back into pump from inside this loop; the guard keeps that
    // from recursing, and the loop re-checks the slots anyway.
    if (this._pumping) {
      return;
    }
    this._pumping = true;
    try {
      let started = true;
      while (started) {
        started = false;
        for (let priority = 0; priority < this._queues.length; priority++) {
          const queue = this._queues[priority]!;
          if (queue.length === 0 || !this.canStart(priority as AssetPriority)) {
            continue;
          }
          const entry = queue.shift()!;
          this.start(entry);
          started = true;
          break;
        }
      }
    } finally {
      this._pumping = false;
    }
  }

  protected start(entry: Entry): void {
    entry.state = "loading";
    this._inFlight++;
    const background = entry.priority > 0;
    if (background) {
      this._inFlightBackground++;
    }
    let done = false;
    const finish = (ok: boolean, bytes: number) => {
      if (done) {
        return;
      }
      done = true;
      this._inFlight--;
      if (background) {
        this._inFlightBackground--;
      }
      if (entry.stale || this._entries.get(entry.key) !== entry) {
        // Removed while loading (the file changed, or a drop): whatever came
        // back belongs to nobody.
        this.releasePlatform(entry);
        this.pump();
        return;
      }
      if (ok) {
        entry.state = "resident";
        entry.bytes = bytes;
        entry.lastUsed = this._tick;
        this._bytes += bytes;
        for (const w of entry.waiters.splice(0)) {
          w();
        }
        this.maybeEvict();
      } else {
        entry.attempts++;
        this.releasePlatform(entry);
        if (entry.attempts < MAX_LOAD_ATTEMPTS) {
          // Back of its own line, so the others get their turn first.
          entry.state = "queued";
          this._queues[entry.priority]!.push(entry);
        } else {
          entry.state = "failed";
          entry.failedAt = this.now();
          for (const w of entry.waiters.splice(0)) {
            w();
          }
        }
      }
      this.pump();
    };
    try {
      this.load(entry).then(
        (bytes) => finish(bytes != null, bytes ?? 0),
        () => finish(false, 0),
      );
    } catch {
      // Creating or arming the load threw. Release the slot, or the cap fills
      // with phantoms and the pump never starts anything again.
      finish(false, 0);
    }
  }

  /** Resolves with the entry's byte estimate when resident, null on failure. */
  protected load(entry: Entry): Promise<number | null> {
    const item = entry.item;
    switch (item.kind) {
      case "image":
        return this.loadImage(entry, item.src);
      case "font":
        return this.loadFont(entry, item);
      case "audio":
        return this.loadAudio(entry, item.params);
      case "video":
        return this.loadVideo(entry, item.src);
    }
  }

  protected loadImage(entry: Entry, src: string): Promise<number | null> {
    return new Promise((resolve) => {
      const target = this._deps.createImage();
      entry.image = target;
      target.onload = () => {
        const estimate = () => {
          const w = target.naturalWidth ?? 0;
          const h = target.naturalHeight ?? 0;
          const floor = isSvg(entry.item) ? MIN_SVG_BYTES : MIN_IMAGE_BYTES;
          return Math.max(floor, w * h * 4);
        };
        let decode: Promise<void> | undefined;
        try {
          decode = target.decode?.();
        } catch {
          decode = undefined;
        }
        if (decode && typeof decode.then === "function") {
          // Decoding ahead is an optimization, never a condition: a failure
          // or a promise that never settles (some browsers, for an image not
          // in the document) still leaves a loaded image the renderer can
          // use; it just paints a moment later.
          let settled = false;
          const done = () => {
            if (!settled) {
              settled = true;
              resolve(estimate());
            }
          };
          decode.then(done, done);
          setTimeout(done, this._decodeTimeoutMs);
        } else {
          resolve(estimate());
        }
      };
      target.onerror = () => resolve(null);
      // Assigned last so the handlers are attached before the load starts.
      target.src = src;
    });
  }

  protected async loadFont(
    entry: Entry,
    item: Extract<AssetItem, { kind: "font" }>,
  ): Promise<number | null> {
    const { fetchBytes, createFontFace, fonts } = this._deps;
    if (!fetchBytes || !createFontFace || !fonts) {
      // No font platform (jsdom): nothing to add, nothing to hold.
      return 0;
    }
    const { bytes } = await fetchBytes(item.src);
    const face = createFontFace(item.family, bytes, {
      weight: item.weight,
      style: item.style,
      stretch: item.stretch,
      display: item.display,
      unicodeRange: item.unicodeRange,
    });
    fonts.add(face);
    entry.font = face;
    await face.load?.();
    return bytes.byteLength;
  }

  protected async loadAudio(
    entry: Entry,
    params: LoadAudioPlayerParams,
  ): Promise<number | null> {
    const decode = this._deps.decodeAudio;
    if (!decode) {
      return 0;
    }
    const buffer = await decode(params);
    if (!buffer) {
      return null;
    }
    entry.audio = buffer;
    return buffer.length * buffer.numberOfChannels * 4;
  }

  protected async loadVideo(entry: Entry, src: string): Promise<number | null> {
    const { fetchBytes, createObjectURL } = this._deps;
    if (!fetchBytes || !createObjectURL) {
      return 0;
    }
    const { bytes, type } = await fetchBytes(src);
    const blob = new Blob([bytes], { type });
    entry.videoUrl = createObjectURL(blob);
    return blob.size;
  }

  /** Evict least-recently-used unpinned entries until under the cache size.
   *  Entries touched this round, and what the page displays or plays, stay. */
  protected maybeEvict(): void {
    if (this._cacheBytes <= 0 || this._bytes <= this._cacheBytes) {
      return;
    }
    const derived = new Set(this._derivedPins());
    const candidates = [...this._entries.values()]
      .filter(
        (e) =>
          e.state === "resident" &&
          e.pins.size === 0 &&
          e.lastUsed !== this._tick &&
          !derived.has(e.key),
      )
      .sort((a, b) => a.lastUsed - b.lastUsed);
    for (const e of candidates) {
      if (this._bytes <= this._cacheBytes) {
        break;
      }
      this.remove(e);
    }
  }
}
