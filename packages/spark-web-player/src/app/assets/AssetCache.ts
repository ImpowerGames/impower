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

/** An element the page keeps in its document with the image as a CSS
 *  background, for as long as the entry is resident. */
export interface WarmHandle {
  remove(): void;
}

/** Everything the cache reaches into the platform for, injectable so tests
 *  run without a browser and the real page passes the real APIs. A missing
 *  capability makes that kind resident without loading anything (jsdom has
 *  no fonts, no fetch, no audio). */
export interface AssetCacheDeps {
  createImage: () => ImageTarget;
  /** Put the image in the document as a CSS background on a hidden element.
   *  Chromium reuses a picture loaded that way for every later use of the
   *  same url: a background, a `mask-image`, an `<img>`. A picture loaded
   *  through an `Image` object alone is reused by backgrounds but not by
   *  masks, and the renderer's shadow layers are masks, so an image warmed
   *  without this is fetched again the moment it is displayed. Returns
   *  nothing when there is nowhere to put the element yet. */
  warmImage?: (src: string) => WarmHandle | undefined;
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
  /** Background requests (priority 1 and up) in flight at once, less the
   *  express slots; and, separately, priority-0 loads in flight at once.
   *  Assets are served by a service worker that reads OPFS (and, in the
   *  cross-origin player, round-trips through the editor), so an unbounded
   *  burst puts every asset behind every other one: warming 261 images at
   *  project open still left the first portrait cold (#344). */
  maxConcurrent?: number;
  /** Slots held back from background requests and from the page's hints,
   *  so a gate always has a slot neither can take; the express lane runs
   *  beside the background lane, not inside it (see `canStart`). */
  expressSlots?: number;
  /** Bytes prediction may keep resident: the pool of entries that are neither
   *  pinned nor displayed nor playing, evicted least recently used first once
   *  it is exceeded. 0 = never evict. */
  predictBytes?: number;
  /** Bytes the `load:` pins may hold between them; a load pins in order
   *  until it is reached and the rest stays resident but unpinned. 0 = no
   *  cap. */
  loadBytes?: number;
  /** How long to wait for `img.decode()` before counting a loaded image
   *  resident anyway. Decoding ahead is an optimization; some browsers never
   *  settle the promise for an image that is not in the document. */
  decodeTimeoutMs?: number;
  /** How long a single load may stay in flight before it counts as a final
   *  failure (no retry: a hang is not a 404). A fetch the service worker
   *  never answers would otherwise hold its slot for the session. 0 = never;
   *  a hung load then holds its slot until the page goes away, though a gate
   *  stops pausing background loads as soon as its pin is released. */
  loadTimeoutMs?: number;
}

export const DEFAULT_DECODE_TIMEOUT_MS = 1500;
/** Generous, because a cold service worker generating filtered SVGs for a
 *  whole scene has been seen to take over twenty seconds for one file, and
 *  a load that times out cannot be cancelled, only started over. */
export const DEFAULT_LOAD_TIMEOUT_MS = 60_000;

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
/** What a resident SVG costs: its parsed document. The browser keeps no
 *  bitmap for it (it rasterizes at paint, for the displayed size only), and
 *  its intrinsic size is whatever its viewBox says, so the pixel formula is
 *  meaningless for it. A 100 KB portrait parses to about this much. */
const SVG_BYTES = 1 * MIB;

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
  /** The pins among `pins` that a priority-0 request put there, whatever
   *  they are called: the gates someone is waiting on. A hint carries no
   *  pin, and an explicit load's set is requested at priority 1, so its
   *  `load:` pin never lands here. */
  gatePins: Set<string>;
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
  /** The hidden element holding the image as a CSS background while the
   *  entry is resident (see {@link AssetCacheDeps.warmImage}). */
  warm?: WarmHandle;
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
 * retries, and the requester hears either way. Pinned entries never evict and
 * never count against prediction: the pool of unpinned entries, less what the
 * page reports as displayed or playing, goes least-recently-used first once
 * `predictBytes` is exceeded. The `load:` pins share `loadBytes` between them.
 */
export class AssetCache {
  protected _entries = new Map<string, Entry>();

  protected _queues: Entry[][] = [[], [], [], []];

  protected _inFlight = 0;

  protected _inFlightBackground = 0;

  /** Priority-0 loads in flight, capped at `maxConcurrent` on their own. */
  protected _inFlightGate = 0;

  /** Every entry in flight, so a pinned priority-0 load can be told apart
   *  from an unpinned one without walking the whole map. */
  protected _loading = new Set<Entry>();

  /** What the last {@link hint} asked for, so the next one can demote what
   *  is still queued. */
  protected _hinted: Entry[] = [];

  protected _pumping = false;

  protected _tick = 1;

  protected _bytes = 0;

  protected _maxConcurrent: number;

  protected _expressSlots: number;

  protected _predictBytes: number;

  protected _loadBytes: number;

  protected _decodeTimeoutMs: number;

  protected _loadTimeoutMs: number;

  protected _derivedPins: () => Iterable<string> = () => [];

  /** Every request made under a pin that has not been released, so progress
   *  for the pin covers all of them, not the latest alone. */
  protected _tracked = new Map<string, Tracked[]>();

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
    this._predictBytes = Math.max(0, options.predictBytes ?? 0);
    this._loadBytes = Math.max(0, options.loadBytes ?? 0);
    this._decodeTimeoutMs = Math.max(
      0,
      options.decodeTimeoutMs ?? DEFAULT_DECODE_TIMEOUT_MS,
    );
    this._loadTimeoutMs = Math.max(
      0,
      options.loadTimeoutMs ?? DEFAULT_LOAD_TIMEOUT_MS,
    );
  }

  get predictBytes() {
    return this._predictBytes;
  }

  get loadBytes() {
    return this._loadBytes;
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

  configure(options: { predictBytes?: number; loadBytes?: number }): void {
    if (options.loadBytes != null && Number.isFinite(options.loadBytes)) {
      this._loadBytes = Math.max(0, options.loadBytes);
    }
    if (options.predictBytes != null && Number.isFinite(options.predictBytes)) {
      this._predictBytes = Math.max(0, options.predictBytes);
      this.maybeEvict();
    }
  }

  setAudioDecoder(
    decode: ((params: LoadAudioPlayerParams) => Promise<AudioBuffer | null>) | undefined,
  ): void {
    this._deps = { ...this._deps, decodeAudio: decode };
  }

  /** Keys the page itself keeps alive: what is displayed or playing. */
  /** Withdraw a provider, but only the one given: a newer application may
   *  already have installed its own. */
  clearDerivedPins(provider: () => Iterable<string>): void {
    if (this._derivedPins === provider) {
      this._derivedPins = () => [];
    }
  }

  clearAudioDecoder(
    decode: ((params: LoadAudioPlayerParams) => Promise<AudioBuffer | null>) | undefined,
  ): void {
    if (decode && this._deps.decodeAudio === decode) {
      this._deps = { ...this._deps, decodeAudio: undefined };
    }
  }

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
   * loaded or failed. A `load:` pin keeps its loaded items in order while the
   * bytes held by every `load:` pin stay under `pinBudget` (default: the
   * configured load cap; 0 = no limit); the rest stay resident but unpinned.
   * A gate pin is never capped unless the request carries its own budget.
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
      if (priority === 0) {
        entry.gatePins.add(pin);
        // A picture a prefetch already had in flight is a gate's now: its
        // priority goes to the express lane too, so a retry after a failed
        // attempt re-enters the lane instead of the queue it was prefetched
        // in, which yields to every gate. The in-flight accounting keeps
        // the lane the load started in.
        if (entry.state === "loading") {
          entry.priority = 0;
        }
        this.promoteInLane(entry);
      }
      entries.push(entry);
    }
    const tracked = this._tracked.get(pin) ?? [];
    tracked.push({ pin, keys: entries.map((e) => e.key) });
    this._tracked.set(pin, tracked);
    this.emitProgress(pin);
    const isLoadPin = pin.startsWith("load:");
    const budget =
      pinBudget != null && pinBudget > 0
        ? pinBudget
        : isLoadPin && this._loadBytes > 0
          ? this._loadBytes
          : Number.POSITIVE_INFINITY;
    const settle = (): LoadAssetsResult => {
      const loaded: string[] = [];
      const failed: string[] = [];
      const pinned: string[] = [];
      let pinnedBytes = isLoadPin
        ? this.loadPinnedBytesExcept(pin)
        : this.pinnedBytesExcept(pin);
      for (const e of entries) {
        // An entry removed while the request ran (its file changed, a drop
        // took it) is gone whatever its last state says.
        const held = this._entries.get(e.key) === e;
        if (held && e.state === "resident") {
          loaded.push(e.key);
          if (pinnedBytes + e.bytes <= budget) {
            pinnedBytes += e.bytes;
            pinned.push(e.key);
          } else {
            e.pins.delete(pin);
            e.gatePins.delete(pin);
          }
        } else {
          failed.push(e.key);
          e.pins.delete(pin);
          e.gatePins.delete(pin);
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

  /**
   * The page's guess at what the next gate will ask for (the beats under
   * the editor's cursor): loaded in the express lane, unpinned, and replaced
   * by the next guess. Whatever an earlier guess left queued goes back to
   * the window's priority, so a cursor moving faster than the loads does not
   * pile every beat it passed in front of the beat it stops on. A hint never
   * pauses background loads; only a pinned request does (see `canStart`).
   */
  hint(items: AssetItem[]): void {
    this.tick();
    for (const e of this._hinted) {
      if (
        e.state === "queued" &&
        e.priority === 0 &&
        e.gatePins.size === 0 &&
        this._entries.get(e.key) === e
      ) {
        this.demote(e);
      }
    }
    this._hinted = [];
    for (const item of items) {
      const entry = this.ensure(item, 0);
      if (entry) {
        this._hinted.push(entry);
      }
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
        e.gatePins.delete(pin);
      }
      if (
        touched &&
        !drop &&
        e.state === "queued" &&
        e.priority === 0 &&
        e.gatePins.size === 0 &&
        !this._hinted.includes(e)
      ) {
        // A gate nobody waits on any more is just a prefetch: out of the
        // express lane, or every abandoned scrub's pictures would sit ahead
        // of the beat the cursor is on now.
        this.demote(e);
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
      } else if (e.state === "loading") {
        // Whatever arrives belongs to nobody: `remove` marks it stale and
        // the load's completion discards it.
        this.remove(e);
        for (const w of e.waiters.splice(0)) {
          w();
        }
      } else if (e.state === "resident" || e.state === "failed") {
        this.remove(e);
      }
    }
    // A released gate stops pausing the background queue, whether or not
    // its loads have settled.
    this.pump();
  }

  /** Forget every failure record, so the next request tries again at once.
   *  An application's teardown calls this: a failure caused by the teardown
   *  itself must not blacklist the next session's first requests. */
  clearFailures(): void {
    for (const e of [...this._entries.values()]) {
      if (e.state === "failed") {
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
    // A gate the change forgot stops pausing the queue.
    this.pump();
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
    let pinnedBytes = 0;
    for (const e of this._entries.values()) {
      if (e.state === "resident" && e.pins.size > 0) {
        pinnedBytes += e.bytes;
      }
    }
    return {
      resident,
      loading,
      queued: this.queuedCount,
      failed,
      bytes,
      pinnedBytes,
      predictBytes: this._predictBytes,
      loadBytes: this._loadBytes,
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
      // A request still waiting settles as failed rather than never.
      for (const w of e.waiters.splice(0)) {
        w();
      }
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
      gatePins: new Set(),
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
      // Nobody waits on a removed entry: its request settles through the
      // waiters the caller fires, so it must not keep pausing the queue
      // (its slot stays taken until the load ends, which cannot be helped).
      this._loading.delete(entry);
      entry.gatePins.clear();
      // The picture may still arrive, but nothing wants it held in the
      // document any more; the load's completion discards the rest.
      if (entry.warm) {
        try {
          entry.warm.remove();
        } catch {
          // Already gone from the document.
        }
        entry.warm = undefined;
      }
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
    if (entry.warm) {
      try {
        entry.warm.remove();
      } catch {
        // An element already gone from the document is what was wanted.
      }
    }
    entry.image = undefined;
    entry.warm = undefined;
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

  /** Bytes held by every `load:` pin other than `pin`: what the load cap
   *  has already been spent on. */
  protected loadPinnedBytesExcept(pin: string): number {
    let total = 0;
    for (const e of this._entries.values()) {
      // What this request itself covers is counted by its settle, once.
      if (e.state !== "resident" || e.pins.has(pin)) {
        continue;
      }
      for (const p of e.pins) {
        if (p !== pin && p.startsWith("load:")) {
          total += e.bytes;
          break;
        }
      }
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
    let total = 0;
    for (const t of tracked) {
      for (const key of t.keys) {
        total++;
        const state = this._entries.get(key)?.state;
        if (state === "resident") {
          loaded++;
        } else if (state === "failed" || state === undefined) {
          failed++;
        }
      }
    }
    const params = { pin, loaded, failed, total };
    for (const listener of this._progressListeners) {
      listener(params);
    }
  }

  /** Whether a request someone is waiting on is queued or loading: an entry
   *  carrying a gate pin, whatever priority its load started at (a picture a
   *  prefetch had already put in flight counts from the moment a gate pins
   *  it). A hint never counts, a `load:` pin never counts, and a gate stops
   *  counting the moment its pins are released, whether or not its loads
   *  have settled: the engine's own timeouts bound its wait, and the page
   *  must not keep waiting on its behalf. */
  protected gatePending(): boolean {
    for (const e of this._queues[0]!) {
      if (e.gatePins.size > 0) {
        return true;
      }
    }
    for (const e of this._loading) {
      if (e.gatePins.size > 0) {
        return true;
      }
    }
    return false;
  }

  /** Take a queued express-lane entry that no gate waits on out of the lane:
   *  to priority 1 while a pin still waits on it, else to the window's
   *  priority. A pin that is not a gate pin came from a priority-1 request,
   *  which is an explicit load's set, so 1 is the priority that request asked
   *  for. */
  protected demote(entry: Entry): void {
    this.dequeue(entry);
    entry.priority = entry.pins.size > 0 ? 1 : 2;
    this._queues[entry.priority]!.push(entry);
  }

  /** Put a queued gate ahead of the hints in the express lane: a gate is
   *  waited on, a hint is a guess, and the lane is served in order. */
  protected promoteInLane(entry: Entry): void {
    if (entry.state !== "queued" || entry.priority !== 0) {
      return;
    }
    const lane = this._queues[0]!;
    const from = lane.indexOf(entry);
    if (from < 0) {
      return;
    }
    let to = 0;
    while (to < from && lane[to]!.gatePins.size > 0) {
      to++;
    }
    if (to < from) {
      lane.splice(from, 1);
      lane.splice(to, 0, entry);
    }
  }

  /**
   * Whether `entry` may start now. The express lane (priority 0) runs
   * beside the background lane rather than inside it, since a background
   * load in flight cannot be cancelled and a gate held behind one holds a
   * reader: up to `maxConcurrent` gate loads, and, for the page's hints, up
   * to that less the express slots, so a gate always has a slot a hint
   * cannot take. Background loads (priority 1 and up) get `maxConcurrent`
   * less the express slots, whatever the express lane holds; prefetches
   * (priority 2 and up) yield entirely while a gate is pending, because
   * every load in flight shares the service worker's time with it (a
   * filtered SVG is a filter pass in the worker before it is bytes) and
   * nobody waits on a prefetch. An explicit load's set (priority 1) is
   * waited on too, behind the loading layout, so it keeps its slots.
   */
  protected canStart(entry: Entry): boolean {
    const priority = entry.priority;
    if (priority === 0) {
      const lane =
        entry.gatePins.size > 0
          ? this._maxConcurrent
          : this._maxConcurrent - this._expressSlots;
      return this._inFlightGate < lane;
    }
    if (priority >= 2 && this.gatePending()) {
      return false;
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
          const head = queue[0];
          if (!head || !this.canStart(head)) {
            continue;
          }
          queue.shift();
          this.start(head);
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
    } else {
      this._inFlightGate++;
    }
    this._loading.add(entry);
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (ok: boolean, bytes: number) => {
      if (done) {
        return;
      }
      done = true;
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      this._loading.delete(entry);
      this._inFlight--;
      if (background) {
        this._inFlightBackground--;
      } else {
        this._inFlightGate--;
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
          // Back of its own line, so the others get their turn first (a
          // service worker that is coming up fails what it is asked first,
          // so every picture gets a first attempt before any gets a second);
          // a gate still goes ahead of the hints, since someone waits on it;
          // and an express-lane entry that no gate waits on any more and
          // that is not the current hint (a gate released while its load
          // was in flight) leaves the lane, as the release rule would have
          // sent it had it been queued.
          entry.state = "queued";
          if (
            entry.priority === 0 &&
            entry.gatePins.size === 0 &&
            !this._hinted.includes(entry)
          ) {
            this.demote(entry);
          } else {
            this._queues[entry.priority]!.push(entry);
            if (entry.gatePins.size > 0) {
              this.promoteInLane(entry);
            }
          }
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
      if (this._loadTimeoutMs > 0) {
        // A load that never settles is a final failure, not a retry (a hang
        // is not a 404, and three of them would hold a slot for minutes):
        // it gives up its slot, and the cool-down lets a later request try
        // again. Cleared by `finish`, so a load that settles leaves nothing
        // armed behind it.
        timer = setTimeout(() => {
          timer = undefined;
          if (!done) {
            entry.attempts = MAX_LOAD_ATTEMPTS - 1;
            finish(false, 0);
          }
        }, this._loadTimeoutMs);
      }
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

  /**
   * Load an image the way the renderer will use it. The picture goes into
   * the document as a CSS background on a hidden element, which is the one
   * form of load Chromium reuses for a later background, mask or `<img>`
   * with the same url; an `Image` object for the same url is the completion
   * signal (it attaches to the fetch in flight and fires `load` when the
   * shared resource is complete) and the source of the size estimate.
   */
  protected loadImage(entry: Entry, src: string): Promise<number | null> {
    return new Promise((resolve) => {
      const target = this._deps.createImage();
      entry.image = target;
      const warm = this._deps.warmImage?.(src);
      entry.warm = warm;
      target.onload = () => {
        const estimate = () => {
          if (isSvg(entry.item)) {
            return SVG_BYTES;
          }
          const w = target.naturalWidth ?? 0;
          const h = target.naturalHeight ?? 0;
          return Math.max(MIN_IMAGE_BYTES, w * h * 4);
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
          let timer: ReturnType<typeof setTimeout> | undefined;
          const done = () => {
            if (!settled) {
              settled = true;
              if (timer !== undefined) {
                clearTimeout(timer);
              }
              resolve(estimate());
            }
          };
          decode.then(done, done);
          timer = setTimeout(done, this._decodeTimeoutMs);
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

  /** Evict least-recently-used entries of the prediction pool (resident,
   *  unpinned, neither displayed nor playing) until the pool is under
   *  `predictBytes`. Entries touched this round stay. Pinned bytes never
   *  count, so a loaded scene does not shrink what prediction may keep. */
  protected maybeEvict(): void {
    if (this._predictBytes <= 0) {
      return;
    }
    const derived = new Set(this._derivedPins());
    const pool = [...this._entries.values()].filter(
      (e) => e.state === "resident" && e.pins.size === 0 && !derived.has(e.key),
    );
    let poolBytes = 0;
    for (const e of pool) {
      poolBytes += e.bytes;
    }
    if (poolBytes <= this._predictBytes) {
      return;
    }
    const candidates = pool
      .filter((e) => e.lastUsed !== this._tick)
      .sort((a, b) => a.lastUsed - b.lastUsed);
    for (const e of candidates) {
      if (poolBytes <= this._predictBytes) {
        break;
      }
      poolBytes -= e.bytes;
      this.remove(e);
    }
  }
}
