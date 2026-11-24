import { getImageThing } from "../../../../sparkdown/src/compiler/utils/getImageThing";
import { createMorphHost, MorphArtifactSlot, type MorphHost } from "../../../../sparkdown/src/morph/hosts";
import {
  APERTURE_REACH_CLIP_STYLE,
  morphFrameState,
  morphPosesAt,
  namespaceMorphMarkup,
  poseAperture,
  poseGradient,
  poseLeaf,
  poseSpreadMask,
  type MorphFrameState,
} from "../../../../sparkdown/src/morph/render";
import {
  layeredMorphDrawn,
  layeredMorphModel,
  type LayeredMorphDrawn,
  type LayeredMorphModel,
} from "../../../../sparkdown/src/morph/layered";
import { morphMotionKeyframes } from "../../../../sparkdown/src/morph/motion";
import { own } from "../../../../sparkdown/src/morph/own";
import { MorphBakeService } from "../../../../sparkdown/src/morph/service";
import { MorphTimeline, morphRandom } from "../../../../sparkdown/src/morph/timeline";
import type { MorphArtifact, MorphTiming } from "../../../../sparkdown/src/morph/types";
import type { MorphStillParams } from "../../../../spark-engine/src/game/modules/ui/classes/messages/MorphStillMessage";
import type {
  MorphImageContent,
  MorphLayerPlay,
  MorphPicture,
  MorphPlay,
} from "../../../../spark-engine/src/game/modules/ui/classes/messages/WriteImageMessage";
import { backgroundRect, cssList, layerValue, svgIntrinsicSize, type Rect } from "./backgroundFit";
import { dataUrlBytes, pictureFileTraits, streamInflate } from "./pictureFileTraits";

export type { MorphImageContent, MorphLayerPlay };

export interface PictureBitmap {
  image: CanvasImageSource;
  width: number;
  height: number;
  animated?: boolean;
  profile?: boolean;
  unread?: boolean;
}

export type PictureLoader = (src: string, doc: Document) => Promise<PictureBitmap | undefined>;

export interface PictureCanvasContext {
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  clearRect(x: number, y: number, width: number, height: number): void;
  drawImage(image: CanvasImageSource, x: number, y: number, width: number, height: number): void;
  globalAlpha: number;
  imageSmoothingEnabled: boolean;
}

export type PictureCanvasFactory = (canvas: HTMLCanvasElement) => PictureCanvasContext | null | undefined;

interface PictureFiles {
  model: LayeredMorphModel;
  bitmaps: Map<number, PictureBitmap>;
  width: number;
  height: number;
}

interface CanvasRun {
  canvas: HTMLCanvasElement;
  context: PictureCanvasContext;
  files: Set<number>;
  painted?: string;
}

interface CanvasView {
  box: HTMLElement;
  runs: CanvasRun[];
  views: Map<number, LiveView>;
  files: PictureFiles;
  drawn: LayeredMorphDrawn[];
  last?: string;
}

export const browserPictureLoader: PictureLoader = async (src, doc) => {
  const view = doc.defaultView as (Window & typeof globalThis) | null;
  const Img = view?.Image;
  if (!view || !Img) return undefined;
  const img = new Img();
  img.decoding = "async";
  img.src = src;
  try {
    await img.decode();
  } catch {
    return undefined;
  }
  if (!(img.naturalWidth > 0 && img.naturalHeight > 0)) return undefined;
  const bytes = await readPictureBytes(src, view);
  const traits = bytes ? await pictureFileTraits(bytes, streamInflate(view)) : undefined;
  return { image: img, width: img.naturalWidth, height: img.naturalHeight, ...(traits ?? { unread: true }) };
};

async function readPictureBytes(src: string, view: Window & typeof globalThis): Promise<Uint8Array | undefined> {
  if (/^data:/i.test(src)) return dataUrlBytes(src);
  try {
    const response = await view.fetch(src);
    return response.ok ? new Uint8Array(await response.arrayBuffer()) : undefined;
  } catch {
    return undefined;
  }
}

const browserCanvas: PictureCanvasFactory = (canvas) => {
  try {
    return canvas.getContext("2d") as PictureCanvasContext | null;
  } catch {
    return undefined;
  }
};

export interface Occurrence {
  key: string;
  timing: MorphTiming;
  owner?: string;
  timeline: MorphTimeline;
  start: number;
  cycles: number;
  users: number;
  preempted: number;
  preemptedAt: number;
}

interface LiveView {
  box: HTMLElement;
  artifact: MorphArtifact;
  prefix: string;
  parts: Element[];
  leaves: { element: Element; node: string; style: string | null; d: string | null; opacity: string | null }[];
  clips: {
    id: string;
    element: Element;
    paths: { element: Element; d: string | null; style: string | null }[];
    reach?: Element;
  }[];
  gradients: {
    id: string;
    element: Element;
    attributes: Record<string, string>;
    stops: { element: Element; attributes: Record<string, string> }[];
  }[];
  masks: { id: string; path: Element; d: string | null; style: string | null }[];
  motions: { element: Element; label: string; effect?: MorphMotionEffect | null }[];
  last?: string;
}

export interface MorphMotionEffect {
  sample(offset: number): void;
  cancel(): void;
}

export type MorphMotionAnimator = (element: Element, keyframes: Keyframe[]) => MorphMotionEffect | undefined;

const MOTION_DURATION = 1000;

const browserAnimator: MorphMotionAnimator = (element, keyframes) => {
  const view = element.ownerDocument.defaultView as (Window & typeof globalThis) | null;
  const Effect = view?.KeyframeEffect;
  const Player = view?.Animation;
  if (!Effect || !Player) return undefined;
  let animation: Animation;
  try {
    animation = new Player(new Effect(element, keyframes, { duration: MOTION_DURATION, fill: "both" }), element.ownerDocument.timeline);
  } catch {
    return undefined;
  }
  return {
    sample: (offset) => {
      animation.currentTime = offset * MOTION_DURATION;
    },
    cancel: () => animation.cancel(),
  };
};

interface FileState {
  file: number;
  slot: MorphArtifactSlot;
  plays: { play: MorphPlay; occurrence?: Occurrence }[];
  view?: LiveView;
}

interface ImageState {
  layer: number;
  span: number;
  picture?: MorphPicture;
  slot: MorphArtifactSlot;
  plays: { play: MorphLayerPlay; occurrence?: Occurrence }[];
  inner: FileState[];
  view?: LiveView;
  canvas?: CanvasView;
  files?: PictureFiles;
  loading?: { artifact: MorphArtifact; done: Promise<void> };
  broken?: boolean;
}

const restFrame = (): MorphFrameState => ({
  shown: new Set(),
  hidden: new Set(),
  geometry: new Map(),
  paint: new Map(),
  gradients: new Map(),
  opacity: new Map(),
  clips: new Map(),
  reaches: new Map(),
  spread: new Map(),
  masks: new Map(),
});

const SVG_NS = "http://www.w3.org/2000/svg";

const MAX_CANVAS_PIXELS = 4096 * 4096;

const HOST_STYLE = "position:absolute;inset:0;overflow:hidden;pointer-events:none;mix-blend-mode:normal";

let occurrencePrefixes = 0;

export interface MorphPlaybackOptions {
  host?: MorphHost;
  seed?: string;
  requestFrame?: (callback: (now: number) => void) => number;
  cancelFrame?: (handle: number) => void;
  animate?: MorphMotionAnimator;
  loadPicture?: PictureLoader;
  pictureCanvas?: PictureCanvasFactory;
}

export class MorphPlayback {
  static for(overlay: HTMLElement): MorphPlayback {
    const holder = overlay as HTMLElement & { __sdMorphs?: MorphPlayback };
    holder.__sdMorphs ??= new MorphPlayback(overlay);
    return holder.__sdMorphs;
  }

  protected host: MorphHost;
  protected delivered = new DeliveredArtifacts();
  protected seed = "";
  protected requestFrame: (callback: (now: number) => void) => number;
  protected cancelFrame: (handle: number) => void;
  animate: MorphMotionAnimator;
  loadPicture: PictureLoader;
  pictureCanvas: PictureCanvasFactory;
  reportStill?: (params: MorphStillParams) => void;
  protected pictures = new Map<string, Promise<PictureBitmap | undefined>>();
  protected static readonly PICTURE_LIMIT = 256;

  protected time = 0;
  protected enabled = true;
  protected paused = false;
  protected session = "";
  protected clockOwner?: object;
  protected frame?: number;
  protected frameTime?: number;

  protected layers = new Set<MorphLayer>();
  protected occurrences = new Map<string, Occurrence>();
  protected speech?: { character?: string; spans: [number, number][]; beeps?: number[] };
  protected resizeObserver?: ResizeObserver;

  constructor(
    readonly overlay: HTMLElement,
    options: MorphPlaybackOptions = {},
  ) {
    const view = overlay.ownerDocument.defaultView;
    this.host = options.host ?? defaultHost(this.delivered);
    this.seed = options.seed ?? "";
    this.animate = options.animate ?? browserAnimator;
    this.loadPicture = options.loadPicture ?? browserPictureLoader;
    this.pictureCanvas = options.pictureCanvas ?? browserCanvas;
    const host = (view ?? window) as Window & typeof globalThis;
    const frames = typeof host.requestAnimationFrame === "function";
    this.requestFrame =
      options.requestFrame ??
      (frames ? (cb) => host.requestAnimationFrame(cb) : (cb) => host.setTimeout(() => cb(host.performance.now()), 16));
    this.cancelFrame =
      options.cancelFrame ?? (frames ? (h) => host.cancelAnimationFrame(h) : (h) => host.clearTimeout(h));
    const Observer = (view as (Window & typeof globalThis) | null)?.ResizeObserver;
    if (Observer) {
      this.resizeObserver = new Observer((entries) => {
        for (const entry of entries) (entry.target as HTMLElement & { __sdMorph?: MorphLayer }).__sdMorph?.layout();
      });
    }
  }

  configure(options: MorphPlaybackOptions) {
    if (options.host) this.host = options.host;
    if (options.seed !== undefined) this.seed = options.seed;
    if (options.requestFrame) this.requestFrame = options.requestFrame;
    if (options.cancelFrame) this.cancelFrame = options.cancelFrame;
    if (options.animate) this.animate = options.animate;
    if (options.loadPicture) {
      this.loadPicture = options.loadPicture;
      this.pictures.clear();
    }
    if (options.pictureCanvas) this.pictureCanvas = options.pictureCanvas;
  }

  picture(src: string): Promise<PictureBitmap | undefined> {
    let loading = this.pictures.get(src);
    if (!loading) {
      if (this.pictures.size >= MorphPlayback.PICTURE_LIMIT) this.pictures.delete(this.pictures.keys().next().value!);
      loading = this.loadPicture(src, this.overlay.ownerDocument).catch(() => undefined);
      this.pictures.set(src, loading);
      void loading.then((bitmap) => {
        if (!bitmap && this.pictures.get(src) === loading) this.pictures.delete(src);
      });
    }
    return loading;
  }

  get resolver(): MorphHost {
    return this.host;
  }

  deliver(params: { key: string; artifact?: MorphArtifact; error?: string }) {
    this.delivered.deliver(params.key, params);
  }

  set askGame(ask: ((key: string) => void) | undefined) {
    this.delivered.ask = ask;
  }

  protected relayoutQueued = false;

  requestRelayout() {
    if (this.relayoutQueued || ![...this.layers].some((layer) => layer.drawable)) return;
    this.relayoutQueued = true;
    queueMicrotask(() => {
      this.relayoutQueued = false;
      for (const layer of this.layers) layer.layout();
    });
  }

  get now(): number {
    return this.time;
  }

  get animating(): boolean {
    return this.enabled || this.playing;
  }

  protected playing = false;

  setPlaying(playing: boolean) {
    if (this.playing === playing) return;
    const was = this.animating;
    this.playing = playing;
    if (!playing) {
      this.speech = undefined;
      for (const occurrence of this.occurrences.values()) {
        if (occurrence.timing.trigger === "speech") this.restart(occurrence);
      }
      this.render();
    }
    this.animatingChanged(was);
  }

  protected animatingChanged(was: boolean) {
    if (this.animating === was) return;
    this.restartAll();
    for (const layer of this.layers) layer.showStill();
    this.render();
    this.schedule();
  }

  attachClock(owner: object) {
    this.clockOwner = owner;
    this.stopFrames();
  }

  detachClock(owner: object) {
    if (this.clockOwner !== owner) return;
    this.clockOwner = undefined;
    this.speak(undefined, []);
    this.schedule();
  }

  speak(character: string | undefined, spans: readonly (readonly [number, number])[], beeps?: readonly number[]) {
    this.speech = {
      ...(character ? { character } : {}),
      spans: spans.map(([start, end]): [number, number] => [this.time + start, this.time + end]),
      ...(beeps ? { beeps: beeps.map((beep) => this.time + beep) } : {}),
    };
    for (const occurrence of this.occurrences.values()) this.hear(occurrence);
    this.render();
  }

  protected hear(occurrence: Occurrence) {
    if (occurrence.timing.trigger !== "speech") return;
    const speech = this.speech;
    const heard = speech && occurrence.owner && occurrence.owner === speech.character ? speech : undefined;
    occurrence.timeline.speak(
      heard?.spans.map(([start, end]): [number, number] => [start - occurrence.start, end - occurrence.start]) ?? [],
      this.time - occurrence.start,
      heard?.beeps?.map((beep) => beep - occurrence.start),
    );
  }

  advance(seconds: number) {
    if (!Number.isFinite(seconds) || seconds <= 0 || this.paused) return;
    this.time += seconds;
    this.render();
  }

  setPaused(paused: boolean) {
    if (this.paused === paused) return;
    this.paused = paused;
    this.frameTime = undefined;
    if (paused) this.stopFrames();
    else this.schedule();
  }

  setEnabled(enabled: boolean) {
    if (this.enabled === enabled) return;
    const was = this.animating;
    this.enabled = enabled;
    this.animatingChanged(was);
  }

  setSession(session: string) {
    if (this.session === session) return;
    this.session = session;
    this.speech = undefined;
    this.restartAll();
    this.render();
  }

  protected restartAll() {
    for (const occurrence of this.occurrences.values()) this.restart(occurrence);
  }

  protected restart(occurrence: Occurrence) {
    occurrence.cycles += 1;
    occurrence.start = this.time;
    occurrence.timeline = new MorphTimeline(occurrence.timing, morphRandom(`${this.seed}|${occurrence.key}|${occurrence.cycles}`));
    if (occurrence.preempted) occurrence.preemptedAt = this.time;
    this.hear(occurrence);
  }

  protected schedule() {
    if (this.frame !== undefined) return;
    if (this.clockOwner || this.paused || !this.animating || ![...this.layers].some((layer) => layer.live)) {
      this.frameTime = undefined;
      return;
    }
    this.frame = this.requestFrame((now) => {
      this.frame = undefined;
      const seconds = now / 1000;
      const last = this.frameTime;
      this.frameTime = seconds;
      if (last !== undefined && !this.clockOwner && !this.paused) this.advance(Math.max(0, seconds - last));
      this.schedule();
    });
  }

  protected stopFrames() {
    if (this.frame !== undefined) this.cancelFrame(this.frame);
    this.frame = undefined;
    this.frameTime = undefined;
  }

  protected acquire(key: string, timing: MorphTiming, owner?: string): Occurrence {
    let occurrence = this.occurrences.get(key);
    if (!occurrence) {
      occurrence = {
        key,
        timing,
        ...(owner ? { owner } : {}),
        timeline: new MorphTimeline(timing, morphRandom(`${this.seed}|${key}|0`)),
        start: this.time,
        cycles: 0,
        users: 0,
        preempted: 0,
        preemptedAt: 0,
      };
      this.occurrences.set(key, occurrence);
      this.hear(occurrence);
    }
    occurrence.users += 1;
    return occurrence;
  }

  protected releaseOccurrence(occurrence: Occurrence) {
    occurrence.users -= 1;
    if (occurrence.users <= 0 && !this.reconciling && this.occurrences.get(occurrence.key) === occurrence) {
      this.occurrences.delete(occurrence.key);
    }
  }

  protected reconciling = false;

  beginPass() {
    this.reconciling = true;
  }

  endPass() {
    this.reconciling = false;
    for (const [key, occurrence] of this.occurrences) {
      if (occurrence.users <= 0) this.occurrences.delete(key);
    }
  }

  preempt(key: string): () => void {
    const occurrence = this.occurrences.get(key);
    if (!occurrence) return () => {};
    if (occurrence.preempted++ === 0) occurrence.preemptedAt = this.time;
    this.render();
    let ended = false;
    return () => {
      if (ended) return;
      ended = true;
      if (--occurrence.preempted === 0) {
        occurrence.start += this.time - occurrence.preemptedAt;
        this.hear(occurrence);
      }
      this.render();
    };
  }

  get occurrenceKeys(): string[] {
    return [...this.occurrences.keys()];
  }

  playhead(occurrence: Occurrence) {
    if (!this.animating || occurrence.preempted) return { phase: "off" as const };
    return occurrence.timeline.at(this.time - occurrence.start);
  }

  mount(
    span: HTMLElement,
    content: MorphImageContent,
    background: string,
    kind: "background" | "mask",
    base: string,
    group: MorphGroup = new MorphGroup(),
  ): MorphLayer {
    const layer = new MorphLayer(this, span, content, background, kind, base, group);
    this.layers.add(layer);
    (span as HTMLElement & { __sdMorph?: MorphLayer }).__sdMorph = layer;
    layer.start();
    return layer;
  }

  freezeWithin(root: Element) {
    for (const layer of this.layersWithin(root)) layer.freeze();
  }

  releaseWithin(root: Element) {
    for (const layer of this.layersWithin(root)) layer.dispose();
  }

  protected layersWithin(root: Element): MorphLayer[] {
    return [...this.layers].filter((layer) => root === layer.span || root.contains(layer.span));
  }

  track(layer: MorphLayer) {
    this.resizeObserver?.observe(layer.span);
    this.schedule();
  }

  forget(layer: MorphLayer) {
    this.layers.delete(layer);
    this.resizeObserver?.unobserve(layer.span);
  }

  occurrenceFor(key: string, timing: MorphTiming, owner?: string) {
    return this.acquire(key, timing, owner);
  }

  letGo(occurrence: Occurrence) {
    this.releaseOccurrence(occurrence);
  }

  render() {
    for (const layer of [...this.layers]) {
      if (!layer.span.isConnected) {
        layer.dispose();
        continue;
      }
      layer.render();
    }
  }

  get stats() {
    const layers = [...this.layers];
    return {
      layers: layers.length,
      live: layers.filter((l) => l.live).length,
      occurrences: [...this.occurrences.values()].filter((o) => o.users > 0).length,
    };
  }
}

class DeliveredArtifacts {
  static readonly LIMIT = 32;
  protected settled = new Map<string, { artifact?: MorphArtifact; error?: string }>();
  protected waiting = new Map<string, Set<() => void>>();

  ask?: (key: string) => void;

  deliver(key: string, outcome: { artifact?: MorphArtifact; error?: string }) {
    this.settled.delete(key);
    this.settled.set(key, outcome);
    while (this.settled.size > DeliveredArtifacts.LIMIT) {
      this.settled.delete(this.settled.keys().next().value!);
    }
    for (const wake of this.waiting.get(key) ?? []) wake();
    this.waiting.delete(key);
  }

  wait(key: string, signal: AbortSignal): Promise<MorphArtifact> {
    if (!this.settled.has(key)) this.ask?.(key);
    return new Promise((resolve, reject) => {
      const settle = () => {
        signal.removeEventListener("abort", abort);
        const outcome = this.settled.get(key)!;
        if (outcome.artifact) resolve(outcome.artifact);
        else reject(new Error(outcome.error ?? `The game could not bake ${key}.`));
      };
      const abort = () => {
        this.waiting.get(key)?.delete(settle);
        reject(signal.reason);
      };
      if (this.settled.has(key)) {
        settle();
        return;
      }
      signal.addEventListener("abort", abort, { once: true });
      const set = this.waiting.get(key) ?? new Set();
      set.add(settle);
      this.waiting.set(key, set);
    });
  }
}

function defaultHost(delivered: DeliveredArtifacts): MorphHost {
  const service = new MorphBakeService({
    ...(typeof URL.createObjectURL === "function"
      ? { createObjectURL: (blob: Blob) => URL.createObjectURL(blob), revokeObjectURL: (url: string) => URL.revokeObjectURL(url) }
      : {}),
  });
  const served = createMorphHost({ service, channel: () => undefined, fetch: (url, init) => fetch(url, init) });
  return {
    resolve: (ref, options) =>
      ref.src
        ? served.resolve(ref, options)
        : service.request(
            ref.key,
            async (signal) => ({ kind: "artifact", artifact: await delivered.wait(ref.key, signal) }),
            options,
          ),
  };
}

export class MorphGroup {
  protected members = new Set<MorphLayer>();
  protected version = 0;

  add(layer: MorphLayer) {
    this.members.add(layer);
  }

  remove(layer: MorphLayer) {
    if (this.members.delete(layer)) void this.changed();
  }

  async changed() {
    const version = ++this.version;
    const members = [...this.members].filter((layer) => layer.active);
    if (members.some((layer) => layer.pending)) return;
    await Promise.all(members.map((layer) => layer.prepare()));
    if (version !== this.version) return;
    for (const layer of members) layer.commit();
  }
}

function decodeImage(doc: Document, url: string): Promise<unknown> {
  const Img = doc.defaultView?.Image;
  if (!Img) return Promise.resolve();
  const img = new Img();
  img.crossOrigin = "anonymous";
  img.src = url;
  return typeof img.decode === "function" ? img.decode().catch(() => undefined) : Promise.resolve();
}

export class MorphLayer {
  protected images: ImageState[] = [];
  protected frozen = false;
  protected disposed = false;
  protected stale = false;
  protected shadowHost?: HTMLElement;
  protected statics: { div: HTMLElement; layer: number }[] = [];

  protected layers: string[];
  protected still?: string[];

  constructor(
    protected playback: MorphPlayback,
    readonly span: HTMLElement,
    protected content: MorphImageContent,
    background: string,
    protected kind: "background" | "mask",
    protected base: string,
    protected group: MorphGroup,
  ) {
    this.layers = cssList(background).reverse();
    group.add(this);
    if (kind === "background" && content.still) this.still = cssList(content.still).reverse();
  }

  get active(): boolean {
    return !this.frozen && !this.disposed;
  }

  get pending(): boolean {
    return this.images.some((image) => image.slot.state === "pending");
  }

  protected staticLayer(index: number): string {
    const image = this.images.find((entry) => index >= entry.layer && index < entry.layer + entry.span);
    const pending =
      !!image &&
      (image.slot.state === "idle" ||
        image.slot.state === "pending" ||
        (image.slot.state === "ready" && image.slot.artifact?.status === "live" && !image.view && !image.canvas && !image.broken));
    return pending && this.still && this.playback.animating ? (this.still[index] ?? this.layers[index]!) : this.layers[index]!;
  }

  showStill() {
    if (!this.still || this.frozen || this.disposed) return;
    if (this.shadowHost) {
      this.layout();
      return;
    }
    this.span.style.setProperty("background-image", this.layers.map((_, index) => this.staticLayer(index)).reverse().join(", "));
  }

  get live(): boolean {
    return !this.frozen && !this.disposed && this.images.some((image) => image.view || image.canvas);
  }

  get drawable(): boolean {
    return (
      !this.frozen &&
      !this.disposed &&
      this.kind === "background" &&
      this.images.some((image) => image.slot.state === "ready" && image.slot.artifact?.status === "live")
    );
  }

  start() {
    for (const play of this.content.plays) {
      if (play.picture && this.kind === "mask") continue;
      let image = this.images.find((entry) => entry.layer === play.layer);
      if (!image) {
        image = {
          layer: play.layer,
          span: play.picture ? Math.max(1, play.picture.span) : 1,
          ...(play.picture ? { picture: play.picture } : {}),
          slot: new MorphArtifactSlot(this.playback.resolver, () => this.changed()),
          plays: [],
          inner: (play.picture?.files ?? []).flatMap((file, index) =>
            file.plays?.length && this.kind === "background"
              ? [
                  {
                    file: index,
                    slot: new MorphArtifactSlot(this.playback.resolver, () => this.changed()),
                    plays: file.plays.map((own) => ({
                      play: own,
                      occurrence: this.playback.occurrenceFor(this.occurrenceKey(own, `${play.layer}/${index}`), own.timing, own.owner),
                    })),
                  },
                ]
              : [],
          ),
        };
        this.images.push(image);
      }
      image.plays.push({
        play,
        ...(this.kind === "background" ? { occurrence: this.playback.occurrenceFor(this.occurrenceKey(play, play.layer), play.timing, play.owner) } : {}),
      });
    }
    this.playback.track(this);
    for (const image of this.images) {
      image.slot.set(image.plays[0]!.play.ref);
      for (const inner of image.inner) inner.slot.set(inner.plays[0]!.play.ref);
    }
    this.showStill();
  }

  protected occurrenceKey(play: MorphPlay, at: number | string): string {
    return [this.base, at, play.owner ?? getImageThing(play.ref.image), play.morph, play.definition, this.content.epoch].join("|");
  }

  protected occurrencesOf(image: ImageState) {
    return [...image.plays, ...image.inner.flatMap((inner) => inner.plays)];
  }

  get occurrenceKeys(): string[] {
    return this.images.flatMap((image) => this.occurrencesOf(image).flatMap((p) => (p.occurrence ? [p.occurrence.key] : [])));
  }

  protected changed() {
    if (!this.active) return;
    if (!this.span.isConnected) {
      this.dispose();
      return;
    }
    this.stale = true;
    void this.group.changed();
  }

  async prepare() {
    if (!this.stale) return;
    if (this.kind === "background") {
      await Promise.all(this.images.map((image) => this.loadPicture(image)));
      return;
    }
    const doc = this.span.ownerDocument;
    await Promise.all([...this.maskUrls().values()].map((url) => decodeImage(doc, url)));
  }

  protected loadPicture(image: ImageState): Promise<void> {
    const artifact = image.slot.state === "ready" ? image.slot.artifact : undefined;
    if (!image.picture || !artifact || artifact.status !== "live") return Promise.resolve();
    if (image.loading?.artifact === artifact) return image.loading.done;
    image.files = undefined;
    image.broken = false;
    const done = this.decodePicture(image, image.picture, artifact);
    image.loading = { artifact, done };
    return done;
  }

  protected async decodePicture(image: ImageState, picture: MorphPicture, artifact: MorphArtifact) {
    const model = layeredMorphModel(artifact);
    const files = picture.files;
    const indices = model ? [...new Set([0, ...model.files])] : [];
    if (!model || indices.some((index) => !files[index])) {
      image.broken = true;
      return;
    }
    const loaded = await Promise.all(indices.map((index) => this.playback.picture(files[index]!.src)));
    if (image.loading?.artifact !== artifact) return;
    const bitmaps = new Map<number, PictureBitmap>();
    indices.forEach((index, i) => {
      const bitmap = loaded[i];
      if (bitmap) bitmaps.set(index, bitmap);
    });
    const bottom = bitmaps.get(0);
    const unfaithful = indices.flatMap((index) => {
      const bitmap = bitmaps.get(index);
      const reason = bitmap?.animated ? ("animated" as const) : bitmap?.profile ? ("profile" as const) : bitmap?.unread ? ("unread" as const) : undefined;
      return reason ? [{ index, reason }] : [];
    });
    for (const { index, reason } of unfaithful) {
      this.playback.reportStill?.({ image: image.plays[0]!.play.ref.image, file: files[index]!.name, reason });
    }
    if (
      !bottom ||
      unfaithful.length > 0 ||
      bitmaps.size !== indices.length ||
      [...bitmaps.values()].some((bitmap) => bitmap.width !== bottom.width || bitmap.height !== bottom.height)
    ) {
      image.broken = true;
      return;
    }
    image.files = { model, bitmaps, width: bottom.width, height: bottom.height };
  }

  commit() {
    if (!this.active || !this.stale) return;
    this.stale = false;
    if (!this.span.isConnected) {
      this.dispose();
      return;
    }
    if (this.kind === "mask") {
      this.applyMask();
      return;
    }
    this.build();
    this.showStill();
    this.playback.track(this);
  }

  protected maskUrls(): Map<number, string> {
    const urls = new Map<number, string>();
    for (const image of this.images) {
      if (image.slot.state !== "ready" || !image.slot.handle) continue;
      try {
        urls.set(image.layer, image.slot.handle.url("rest"));
      } catch {
      }
    }
    return urls;
  }

  protected applyMask() {
    const urls = this.maskUrls();
    if (!urls.size) return;
    const layers = [...this.layers];
    for (const [layer, url] of urls) layers[layer] = `url("${url}")`;
    this.span.style.setProperty("mask-image", [...layers].reverse().join(", "));
  }

  protected build() {
    this.releaseMotions();
    for (const image of this.images) {
      image.view = undefined;
      image.canvas = undefined;
      for (const inner of image.inner) inner.view = undefined;
    }
    const ready = this.images.filter(
      (image) =>
        image.slot.state === "ready" &&
        image.slot.artifact?.status === "live" &&
        (!image.picture || (!!image.files && !image.broken)),
    );
    if (!ready.length) {
      this.unbuild();
      return;
    }
    const doc = this.span.ownerDocument;
    if (!this.shadowHost) {
      const host = doc.createElement("span");
      host.className = "morph";
      host.setAttribute("style", HOST_STYLE);
      host.attachShadow({ mode: "open" });
      this.span.appendChild(host);
      this.shadowHost = host;
    }
    const root = this.shadowHost.shadowRoot!;
    root.replaceChildren();
    this.statics = [];
    const computed = doc.defaultView?.getComputedStyle(this.span);
    const count = this.layers.length;
    const still = (i: number) => {
      const div = doc.createElement("div");
      this.statics.push({ div, layer: i });
      root.appendChild(div);
    };
    for (let i = 0; i < count; i++) {
      const state = ready.find((image) => image.layer === i);
      if (state?.picture) {
        const span = Math.min(state.span, count - i);
        const canvas = this.pictureRect(state, computed) ? this.canvasView(state, doc) : undefined;
        if (canvas) {
          state.canvas = canvas;
          root.appendChild(canvas.box);
        } else {
          if (this.pictureRect(state, computed)) state.broken = true;
          for (let k = 0; k < span; k++) still(i + k);
        }
        i += span - 1;
        continue;
      }
      const view =
        state && !state.broken && this.placement(state.slot.artifact!, computed, count - 1 - i)
          ? this.liveView(state.slot.artifact!, doc)
          : undefined;
      if (state && !view && !state.broken && this.placement(state.slot.artifact!, computed, count - 1 - i)) {
        state.broken = true;
      }
      if (state && view) {
        state.view = view;
        root.appendChild(view.box);
        continue;
      }
      still(i);
    }
    this.span.style.setProperty("background-image", "none");
    this.layout();
    this.render();
  }

  protected unbuild() {
    if (!this.shadowHost) return;
    this.shadowHost.remove();
    this.shadowHost = undefined;
    this.statics = [];
    this.span.style.setProperty("background-image", [...this.layers].reverse().join(", "));
  }

  protected layerStyle(computed: CSSStyleDeclaration | undefined, cssIndex: number): string {
    if (!computed) return "background-repeat:no-repeat";
    const value = (name: string) => layerValue(computed.getPropertyValue(name), cssIndex);
    return ["background-size", "background-position", "background-repeat"]
      .map((name) => {
        const v = value(name);
        return v ? `${name}:${v}` : "";
      })
      .filter(Boolean)
      .join(";");
  }

  protected liveView(artifact: MorphArtifact, doc: Document): LiveView | undefined {
    const prefix = `${artifact.idPrefix.slice(0, -1)}o${++occurrencePrefixes}_`;
    const box = doc.createElement("div");
    box.setAttribute("style", "position:absolute;left:0;top:0;width:100%;height:100%");
    const outer = doc.createElementNS(SVG_NS, "svg");
    outer.setAttribute("width", "100%");
    outer.setAttribute("height", "100%");
    outer.setAttribute("style", "position:absolute;inset:0;overflow:visible");
    const parser = new (doc.defaultView?.DOMParser ?? DOMParser)();
    const parts: Element[] = [];
    for (const part of artifact.parts) {
      const parsed = parser.parseFromString(namespaceMorphMarkup(part.svg, artifact.idPrefix, prefix), "image/svg+xml");
      const svg = parsed.documentElement;
      if (!svg || svg.localName !== "svg" || parsed.getElementsByTagName("parsererror").length) return undefined;
      const node = doc.importNode(svg, true);
      inert(node);
      node.setAttribute("x", "0");
      node.setAttribute("y", "0");
      node.setAttribute("width", "100%");
      node.setAttribute("height", "100%");
      outer.appendChild(node);
      parts.push(node);
    }
    box.appendChild(outer);
    const leaves: LiveView["leaves"] = [];
    for (const element of Array.from(outer.querySelectorAll("[data-morph]"))) {
      leaves.push({
        element,
        node: element.getAttribute("data-morph")!,
        style: element.getAttribute("style"),
        d: element.getAttribute("d"),
        opacity: element.getAttribute("opacity"),
      });
    }
    const clips: LiveView["clips"] = [];
    const masks: LiveView["masks"] = [];
    const spreadMasks = new Set(Object.values(artifact.spreads ?? {}).flatMap((spread) => (spread.mask ? [spread.mask] : [])));
    const apertures = [...Array.from(outer.getElementsByTagNameNS(SVG_NS, "mask")), ...Array.from(outer.getElementsByTagNameNS(SVG_NS, "clipPath"))];
    for (const aperture of apertures) {
      const id = aperture.getAttribute("id");
      if (!id) continue;
      const paths = Array.from(aperture.children)
        .filter((child) => child.localName === "path")
        .map((element) => ({ element, d: element.getAttribute("d"), style: element.getAttribute("style") }));
      const named = id.split(prefix).join(artifact.idPrefix);
      if (!spreadMasks.has(named)) clips.push({ id: named, element: aperture, paths });
      else if (paths[0]) masks.push({ id: named, path: paths[0].element, d: paths[0].d, style: paths[0].style });
    }
    const markup = (element: Element) => Object.fromEntries(Array.from(element.attributes, (a) => [a.name, a.value]));
    const gradients: LiveView["gradients"] = [];
    const copies = new Set(
      artifact.segments.flatMap((s) => s.transitions.flatMap((t) => (t.kind === "morph" ? [t.gradients?.fill?.id, t.gradients?.stroke?.id] : []))),
    );
    for (const element of [...Array.from(outer.getElementsByTagNameNS(SVG_NS, "linearGradient")), ...Array.from(outer.getElementsByTagNameNS(SVG_NS, "radialGradient"))]) {
      const id = (element.getAttribute("id") ?? "").split(prefix).join(artifact.idPrefix);
      if (!copies.has(id)) continue;
      const stops = Array.from(element.children)
        .filter((child) => child.localName === "stop")
        .map((stop) => ({ element: stop, attributes: markup(stop) }));
      gradients.push({ id, element, attributes: markup(element), stops });
    }
    const motions: LiveView["motions"] = Array.from(outer.querySelectorAll("[data-morph-motion]"), (element) => ({
      element,
      label: element.getAttribute("data-morph-motion")!,
    }));
    return { box, artifact, prefix, parts, leaves, clips, gradients, masks, motions };
  }

  protected placement(
    artifact: MorphArtifact,
    computed: CSSStyleDeclaration | undefined,
    cssIndex: number,
    area = { width: 100, height: 100 },
  ) {
    return this.rectFor(svgIntrinsicSize(artifact), computed, cssIndex, area);
  }

  protected rectFor(
    size: { width?: number; height?: number; ratio?: number },
    computed: CSSStyleDeclaration | undefined,
    cssIndex: number,
    area: { width: number; height: number },
  ) {
    const value = (name: string) => (computed ? layerValue(computed.getPropertyValue(name), cssIndex) : "");
    const repeat = value("background-repeat");
    if (repeat && repeat !== "no-repeat" && repeat !== "no-repeat no-repeat") return undefined;
    return backgroundRect(area, size, value("background-size") || "auto", value("background-position") || "0% 0%");
  }

  protected pictureRect(state: ImageState, computed: CSSStyleDeclaration | undefined, area = { width: 100, height: 100 }) {
    const files = state.files;
    if (!files) return undefined;
    const size = { width: files.width, height: files.height, ratio: files.width / files.height };
    return this.rectFor(size, computed, this.layers.length - 1 - state.layer, area);
  }

  protected canvasView(state: ImageState, doc: Document): CanvasView | undefined {
    const files = state.files!;
    const box = doc.createElement("div");
    box.setAttribute("style", "position:absolute;left:0;top:0;width:0;height:0");
    const views = new Map<number, LiveView>();
    for (const inner of state.inner) {
      const artifact = inner.slot.state === "ready" ? inner.slot.artifact : undefined;
      const view = artifact?.status === "live" ? this.liveView(artifact, doc) : undefined;
      if (!view) continue;
      inner.view = view;
      views.set(inner.file, view);
    }
    const runs: CanvasRun[] = [];
    let current: CanvasRun | undefined;
    for (const { file } of files.model.chains) {
      const view = views.get(file);
      if (view) {
        current = undefined;
        box.appendChild(view.box);
        continue;
      }
      if (!current) {
        const canvas = doc.createElement("canvas");
        const context = this.playback.pictureCanvas(canvas);
        if (!context) return undefined;
        canvas.setAttribute("style", "position:absolute;inset:0;width:100%;height:100%;display:block");
        box.appendChild(canvas);
        current = { canvas, context, files: new Set() };
        runs.push(current);
      }
      current.files.add(file);
    }
    return { box, runs, views, files, drawn: layeredMorphDrawn(files.model) };
  }

  protected placeCanvas(view: CanvasView, rect: Rect) {
    const win = this.span.ownerDocument.defaultView;
    const dpr = win?.devicePixelRatio && win.devicePixelRatio > 0 ? win.devicePixelRatio : 1;
    let { x, y, width, height } = rect;
    const host = this.shadowHost;
    const bounds = host?.getBoundingClientRect();
    if (host && bounds && host.offsetWidth > 0 && Math.abs(bounds.width - host.offsetWidth) < 0.5) {
      const snap = (value: number) => Math.round(value * dpr) / dpr;
      const left = snap(bounds.left + x) - bounds.left;
      const top = snap(bounds.top + y) - bounds.top;
      width = snap(bounds.left + x + width) - bounds.left - left;
      height = snap(bounds.top + y + height) - bounds.top - top;
      x = left;
      y = top;
    }
    const style = `position:absolute;left:${x}px;top:${y}px;width:${width}px;height:${height}px`;
    if (view.box.getAttribute("style") !== style) view.box.setAttribute("style", style);
    const pixels = Math.max(1, width * dpr) * Math.max(1, height * dpr);
    const shrink = pixels > MAX_CANVAS_PIXELS ? Math.sqrt(MAX_CANVAS_PIXELS / pixels) : 1;
    const w = Math.max(1, Math.round(width * dpr * shrink));
    const h = Math.max(1, Math.round(height * dpr * shrink));
    for (const run of view.runs) {
      if (run.canvas.width !== w || run.canvas.height !== h) {
        run.canvas.width = w;
        run.canvas.height = h;
        run.painted = undefined;
      }
    }
    this.paint(view);
  }

  protected paint(view: CanvasView) {
    for (const run of view.runs) {
      const { canvas, context } = run;
      const drawn = view.drawn.filter(({ file }) => run.files.has(file));
      const key = `${canvas.width}x${canvas.height}|${drawn.map(({ file, opacity }) => `${file}:${opacity}`).join(",")}`;
      if (run.painted === key) continue;
      run.painted = key;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.globalAlpha = 1;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.imageSmoothingEnabled = true;
      for (const { file, opacity } of drawn) {
        const bitmap = view.files.bitmaps.get(file);
        if (!bitmap) continue;
        context.globalAlpha = opacity;
        context.drawImage(bitmap.image, 0, 0, canvas.width, canvas.height);
      }
      context.globalAlpha = 1;
    }
    for (const [file, live] of view.views) {
      const drawn = view.drawn.find((entry) => entry.file === file);
      write(live.box, "style", `position:absolute;left:0;top:0;width:100%;height:100%;${drawn ? (drawn.opacity < 1 ? `opacity:${drawn.opacity}` : "") : "display:none"}`);
    }
  }

  layout() {
    if (!this.shadowHost) return;
    const computed = this.span.ownerDocument.defaultView?.getComputedStyle(this.span);
    const count = this.layers.length;
    for (const state of this.images) {
      const artifact = state.slot.state === "ready" ? state.slot.artifact : undefined;
      if (!artifact || artifact.status !== "live" || state.broken || (state.picture && !state.files)) continue;
      const eligible = state.picture
        ? !!this.pictureRect(state, computed)
        : !!this.placement(artifact, computed, count - 1 - state.layer);
      if (eligible !== !!(state.picture ? state.canvas : state.view)) {
        this.build();
        return;
      }
    }
    for (const { div, layer } of this.statics) {
      const style = `position:absolute;inset:0;background-image:${this.staticLayer(layer)};${this.layerStyle(computed, count - 1 - layer)}`;
      if (div.getAttribute("style") !== style) div.setAttribute("style", style);
    }
    const area = positioningArea(this.span, computed);
    if (!(area.width > 0 && area.height > 0)) return;
    for (const state of this.images) {
      if (state.canvas) {
        const rect = this.pictureRect(state, computed, area);
        if (rect) this.placeCanvas(state.canvas, rect);
        continue;
      }
      const view = state.view;
      if (!view) continue;
      const rect = this.placement(view.artifact, computed, count - 1 - state.layer, area);
      if (!rect) continue;
      for (const part of view.parts) {
        part.setAttribute("x", String(rect.x));
        part.setAttribute("y", String(rect.y));
        part.setAttribute("width", String(rect.width));
        part.setAttribute("height", String(rect.height));
      }
    }
  }

  render() {
    if (this.frozen || this.disposed) return;
    for (const image of this.images) {
      if (image.canvas) {
        const canvas = image.canvas;
        this.renderFrame(canvas, image.slot.artifact, image.plays, (frame) => {
          canvas.drawn = layeredMorphDrawn(canvas.files.model, frame);
          this.paint(canvas);
        });
        for (const inner of image.inner) if (inner.view) this.renderView(inner.view, inner.plays);
        continue;
      }
      if (image.view) this.renderView(image.view, image.plays);
    }
  }

  protected renderView(view: LiveView, plays: { play: MorphPlay; occurrence?: Occurrence }[]) {
    this.renderFrame(view, view.artifact, plays, (frame, heads) => {
      applyFrame(view, frame);
      plays.forEach(({ play }, i) => this.moveLayers(view, play, heads[i]!));
    });
  }

  protected renderFrame(
    target: { last?: string },
    artifact: MorphArtifact | undefined,
    plays: { play: MorphPlay; occurrence?: Occurrence }[],
    draw: (frame: MorphFrameState, heads: (number | "rest")[]) => void,
  ) {
    if (!artifact || !plays.some((p) => p.occurrence)) return;
    const heads = plays.map(({ occurrence }) => {
      const head = occurrence ? this.playback.playhead(occurrence) : undefined;
      return head && "offset" in head ? head.offset : ("rest" as const);
    });
    const signature = heads.join(",");
    if (target.last === signature) return;
    target.last = signature;
    const offsets: Record<string, number> = Object.create(null);
    plays.forEach(({ play }, i) => {
      const at = heads[i]!;
      if (at !== "rest") offsets[play.morph] = at;
    });
    draw(Object.keys(offsets).length ? morphFrameState(artifact, morphPosesAt(artifact, offsets)) : restFrame(), heads);
  }

  protected moveLayers(view: LiveView, play: MorphPlay, at: number | "rest") {
    for (const motion of view.motions) {
      const track = play.motion && own(play.motion, motion.label);
      if (!track) continue;
      if (at === "rest") {
        motion.effect?.cancel();
        continue;
      }
      if (motion.effect === undefined) motion.effect = this.playback.animate(motion.element, morphMotionKeyframes(track) as Keyframe[]) ?? null;
      motion.effect?.sample(at);
    }
  }

  protected releaseMotions() {
    for (const image of this.images) {
      for (const view of [image.view, ...image.inner.map((inner) => inner.view)]) {
        for (const motion of view?.motions ?? []) motion.effect?.cancel();
      }
    }
  }

  freeze() {
    if (this.frozen || this.disposed) return;
    this.frozen = true;
    for (const image of this.images) {
      for (const entry of this.occurrencesOf(image)) {
        if (entry.occurrence) this.playback.letGo(entry.occurrence);
        entry.occurrence = undefined;
      }
    }
    this.group.remove(this);
  }

  dispose() {
    if (this.disposed) return;
    this.freeze();
    this.disposed = true;
    this.releaseMotions();
    for (const image of this.images) {
      image.slot.dispose();
      image.view = undefined;
      image.canvas = undefined;
      for (const inner of image.inner) {
        inner.slot.dispose();
        inner.view = undefined;
      }
    }
    this.playback.forget(this);
    delete (this.span as HTMLElement & { __sdMorph?: MorphLayer }).__sdMorph;
  }
}

function positioningArea(span: HTMLElement, computed: CSSStyleDeclaration | undefined) {
  const px = (name: string) => Number.parseFloat(computed?.getPropertyValue(name) ?? "");
  const width = px("width");
  const height = px("height");
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return { width: span.clientWidth, height: span.clientHeight };
  }
  const sum = (...names: string[]) => names.reduce((total, name) => total + (px(name) || 0), 0);
  const borderBox = computed?.getPropertyValue("box-sizing") === "border-box";
  return borderBox
    ? {
        width: width - sum("border-left-width", "border-right-width"),
        height: height - sum("border-top-width", "border-bottom-width"),
      }
    : {
        width: width + sum("padding-left", "padding-right"),
        height: height + sum("padding-top", "padding-bottom"),
      };
}

const EXECUTABLE = new Set(["script", "iframe", "object", "embed"]);

function inert(root: Element) {
  for (const element of [root, ...Array.from(root.querySelectorAll("*"))]) {
    if (EXECUTABLE.has(element.localName.toLowerCase())) {
      element.remove();
      continue;
    }
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const link = name === "href" || name.endsWith(":href") || name === "src";
      const scheme = [...attribute.value].filter((c) => c.charCodeAt(0) > 32 && c.charCodeAt(0) !== 127).join("");
      if (name.startsWith("on") || (link && /^javascript:/i.test(scheme))) {
        element.removeAttribute(attribute.name);
      }
    }
  }
}

function applyFrame(view: LiveView, frame: MorphFrameState) {
  for (const leaf of view.leaves) {
    const element = {
      tagName: leaf.element.localName,
      attributes: {
        ...(leaf.style === null ? {} : { style: leaf.style }),
        ...(leaf.d === null ? {} : { d: leaf.d }),
        ...(leaf.opacity === null ? {} : { opacity: leaf.opacity }),
      } as Record<string, string>,
      children: [],
    };
    poseLeaf(element, leaf.node, frame);
    const style = element.attributes["style"];
    write(leaf.element, "style", style === undefined ? null : namespaceMorphMarkup(style, view.artifact.idPrefix, view.prefix));
    write(leaf.element, "d", element.attributes["d"] ?? null);
  }
  for (const gradient of view.gradients) {
    const element = {
      tagName: gradient.element.localName,
      attributes: { ...gradient.attributes },
      children: gradient.stops.map((stop) => ({ tagName: "stop", attributes: { ...stop.attributes }, children: [] })),
    };
    const posed = frame.gradients.get(gradient.id);
    if (posed) poseGradient(element, posed);
    for (const [name, value] of Object.entries(element.attributes)) write(gradient.element, name, value);
    gradient.stops.forEach((stop, i) => {
      for (const [name, value] of Object.entries(element.children[i]!.attributes)) write(stop.element, name, value);
    });
  }
  for (const mask of view.masks) {
    const path = {
      tagName: "path",
      attributes: {
        ...(mask.style === null ? {} : { style: mask.style }),
        ...(mask.d === null ? {} : { d: mask.d }),
      } as Record<string, string>,
      children: [],
    };
    const posed = frame.masks.get(mask.id);
    if (posed) poseSpreadMask({ tagName: "mask", attributes: {}, children: [path] }, posed);
    write(mask.path, "style", path.attributes["style"] ?? null);
    write(mask.path, "d", path.attributes["d"] ?? null);
  }
  for (const clip of view.clips) {
    const paths = clip.paths.map((path) => ({
      tagName: "path",
      attributes: {
        ...(path.style === null ? {} : { style: path.style }),
        ...(path.d === null ? {} : { d: path.d }),
      } as Record<string, string>,
      children: [],
    }));
    const d = frame.clips.get(clip.id);
    const aperture = { tagName: clip.element.localName, attributes: { id: clip.element.getAttribute("id") ?? "" }, children: paths };
    const bound = d === undefined ? undefined : poseAperture(aperture, d, frame.reaches.get(clip.id));
    clip.paths.forEach((path, index) => {
      write(path.element, "style", paths[index]!.attributes["style"] ?? null);
      write(path.element, "d", paths[index]!.attributes["d"] ?? null);
    });
    if (!bound) continue;
    if (!clip.reach) {
      const doc = clip.element.ownerDocument;
      const element = doc.createElementNS(SVG_NS, "clipPath");
      element.setAttribute("id", bound.id);
      element.setAttribute("clipPathUnits", "userSpaceOnUse");
      clip.reach = doc.createElementNS(SVG_NS, "path");
      clip.reach.setAttribute("style", APERTURE_REACH_CLIP_STYLE);
      element.appendChild(clip.reach);
      clip.element.appendChild(element);
    }
    write(clip.reach, "d", bound.d);
  }
}

function write(element: Element, name: string, value: string | null) {
  if (element.getAttribute(name) === value) return;
  if (value === null) element.removeAttribute(name);
  else element.setAttribute(name, value);
}
