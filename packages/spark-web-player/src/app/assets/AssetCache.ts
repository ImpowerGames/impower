import { type LoadAudioPlayerParams } from "../../../../spark-engine/src/game/modules/audio/types/LoadAudioPlayerParams";
import {
  assetItemKey,
  type AssetItem,
  type AssetPriority,
} from "../../../../spark-engine/src/game/modules/assets/types/AssetItem";
import { type AssetsProgressParams } from "../../../../spark-engine/src/game/modules/assets/types/AssetsProgressParams";
import { type LoadAssetsResult } from "../../../../spark-engine/src/game/modules/assets/types/LoadAssetsResult";

export interface ImageTarget {
  src: string;
  onload: ((this: any, ev: any) => any) | null;
  onerror: ((this: any, ev: any) => any) | null;
  naturalWidth?: number;
  naturalHeight?: number;
  decode?: () => Promise<void>;
}

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

export interface WarmHandle {
  remove(): void;
}

export interface AssetCacheDeps {
  createImage: () => ImageTarget;
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
  now?: () => number;
}

export interface AssetCacheOptions {
  maxConcurrent?: number;
  expressSlots?: number;
  predictBytes?: number;
  loadBytes?: number;
  decodeTimeoutMs?: number;
  loadTimeoutMs?: number;
}

export const DEFAULT_DECODE_TIMEOUT_MS = 1500;
export const DEFAULT_LOAD_TIMEOUT_MS = 60_000;

export const DEFAULT_MAX_CONCURRENT = 6;
export const DEFAULT_EXPRESS_SLOTS = 2;
export const MAX_LOAD_ATTEMPTS = 3;
export const FAILED_RETRY_COOLDOWN_MS = 5000;

const KIB = 1024;
const MIB = 1024 * KIB;
const MIN_IMAGE_BYTES = 256 * KIB;
const SVG_BYTES = 1 * MIB;

type EntryState = "queued" | "loading" | "resident" | "failed";

interface Entry {
  key: string;
  item: AssetItem;
  file: string;
  state: EntryState;
  priority: AssetPriority;
  pins: Set<string>;
  gatePins: Set<string>;
  bytes: number;
  lastUsed: number;
  attempts: number;
  failedAt: number;
  stale: boolean;
  image?: ImageTarget;
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
  (/\.svg(\?|$)/i.test(item.src) || item.src.includes("attributes="));

export class AssetCache {
  protected _entries = new Map<string, Entry>();

  protected _queues: Entry[][] = [[], [], [], []];

  protected _inFlight = 0;

  protected _inFlightBackground = 0;

  protected _inFlightGate = 0;

  protected _loading = new Set<Entry>();

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

  protected _tracked = new Map<string, Tracked[]>();

  protected _progressListeners = new Set<(p: AssetsProgressParams) => void>();

  constructor(
    protected _deps: AssetCacheDeps,
    options: AssetCacheOptions = {},
  ) {
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

  touch(key: string): void {
    const e = this._entries.get(key);
    if (e) {
      e.lastUsed = this._tick;
    }
  }

  tick(): void {
    this._tick++;
  }

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

  prefetch(items: AssetItem[], priority: AssetPriority): void {
    this.tick();
    for (const item of items) {
      this.ensure(item, priority);
    }
    this.pump();
  }

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
        this.remove(e);
        for (const w of e.waiters.splice(0)) {
          w();
        }
      } else if (e.state === "resident" || e.state === "failed") {
        this.remove(e);
      }
    }
    this.pump();
  }

  clearFailures(): void {
    for (const e of [...this._entries.values()]) {
      if (e.state === "failed") {
        this.remove(e);
      }
    }
  }

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

  dispose(): void {
    for (const e of [...this._entries.values()]) {
      if (e.state === "queued") {
        this.dequeue(e);
      }
      this.remove(e);
      for (const w of e.waiters.splice(0)) {
        w();
      }
    }
    this._tracked.clear();
  }

  protected ensure(item: AssetItem, priority: AssetPriority): Entry | null {
    const key = assetItemKey(item);
    if (!key || (item.kind !== "audio" && item.src.startsWith("data:"))) {
      return null;
    }
    let entry = this._entries.get(key);
    if (entry) {
      entry.lastUsed = this._tick;
      if (entry.state === "queued" && priority < entry.priority) {
        this.dequeue(entry);
        entry.priority = priority;
        this._queues[priority]!.push(entry);
      } else if (
        entry.state === "failed" &&
        this.now() - entry.failedAt >= FAILED_RETRY_COOLDOWN_MS
      ) {
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
      this._loading.delete(entry);
      entry.gatePins.clear();
      if (entry.warm) {
        try {
          entry.warm.remove();
        } catch {
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
      }
    }
    if (entry.videoUrl) {
      this._deps.revokeObjectURL?.(entry.videoUrl);
    }
    if (entry.warm) {
      try {
        entry.warm.remove();
      } catch {
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

  protected loadPinnedBytesExcept(pin: string): number {
    let total = 0;
    for (const e of this._entries.values()) {
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

  protected demote(entry: Entry): void {
    this.dequeue(entry);
    entry.priority = entry.pins.size > 0 ? 1 : 2;
    this._queues[entry.priority]!.push(entry);
  }

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
        timer = setTimeout(() => {
          timer = undefined;
          if (!done) {
            entry.attempts = MAX_LOAD_ATTEMPTS - 1;
            finish(false, 0);
          }
        }, this._loadTimeoutMs);
      }
    } catch {
      finish(false, 0);
    }
  }

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
      target.src = src;
    });
  }

  protected async loadFont(
    entry: Entry,
    item: Extract<AssetItem, { kind: "font" }>,
  ): Promise<number | null> {
    const { fetchBytes, createFontFace, fonts } = this._deps;
    if (!fetchBytes || !createFontFace || !fonts) {
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

  protected maybeEvict(): void {
    if (this._predictBytes <= 0) {
      return;
    }
    const resident = [...this._entries.values()].filter(
      (e) => e.state === "resident" && e.pins.size === 0,
    );
    let poolBytes = 0;
    for (const e of resident) {
      poolBytes += e.bytes;
    }
    if (poolBytes <= this._predictBytes) {
      return;
    }
    const derived = new Set(this._derivedPins());
    const pool = resident.filter((e) => !derived.has(e.key));
    poolBytes = 0;
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
