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
  LayeredPicture,
  MorphImageContent,
  MorphLayerPlay,
  MorphPicture,
} from "../../../../spark-engine/src/game/modules/ui/classes/messages/WriteImageMessage";
import { pictureZoomReach } from "../../../../spark-dom/src/utils/placePicture";
import { backgroundRect, cssList, layerValue, svgIntrinsicSize, type Rect } from "./backgroundFit";
import { layerPaint, type LayerBoxes, type LayerPaint } from "./pictureLayers";
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
  globalCompositeOperation?: string;
  imageSmoothingQuality?: string;
  fillStyle?: string | CanvasGradient | CanvasPattern;
  save?(): void;
  restore?(): void;
  beginPath?(): void;
  rect?(x: number, y: number, width: number, height: number): void;
  clip?(): void;
  fillRect?(x: number, y: number, width: number, height: number): void;
  createPattern?(image: CanvasImageSource, repetition: string): CanvasPattern | null;
}

export type PictureCanvasFactory = (canvas: HTMLCanvasElement) => PictureCanvasContext | null | undefined;

interface PictureFiles {
  bitmaps: Map<number, PictureBitmap>;
  width: number;
  height: number;
}

interface MorphPictureFiles extends PictureFiles {
  model: LayeredMorphModel;
}

interface StillPicture {
  layer: number;
  span: number;
  picture: MorphPicture;
  files?: PictureFiles;
  canvas?: CanvasView;
  loading?: boolean;
  broken?: boolean;
}

interface StillPaint {
  plans: LayerPaint[];
  left: number;
  top: number;
  unitX: number;
  unitY: number;
  fill?: string;
}

interface CanvasView {
  still?: StillPaint;
  box: HTMLElement;
  canvas: HTMLCanvasElement;
  context: PictureCanvasContext;
  files: PictureFiles;
  drawn: LayeredMorphDrawn[];
  smooth?: boolean;
  painted?: string;
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

interface ImageState {
  layer: number;
  span: number;
  picture?: MorphPicture;
  slot: MorphArtifactSlot;
  plays: { play: MorphLayerPlay; occurrence?: Occurrence }[];
  view?: LiveView;
  canvas?: CanvasView;
  files?: MorphPictureFiles;
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

const BACKGROUND_GEOMETRY = new Set(["backgroundposition", "backgroundpositionx", "backgroundpositiony", "backgroundsize"]);

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
  residentPicture?: (src: string) => PictureBitmap | undefined;
  protected pictures = new Map<string, Promise<PictureBitmap | undefined>>();
  protected loadedPictures = new Map<string, PictureBitmap>();
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
      this.loadedPictures.clear();
    }
    if (options.pictureCanvas) this.pictureCanvas = options.pictureCanvas;
  }

  pictureNow(src: string): PictureBitmap | undefined {
    return this.residentPicture?.(src) ?? this.loadedPictures.get(src);
  }

  picture(src: string): Promise<PictureBitmap | undefined> {
    const resident = this.residentPicture?.(src);
    if (resident) return Promise.resolve(resident);
    let loading = this.pictures.get(src);
    if (!loading) {
      if (this.pictures.size >= MorphPlayback.PICTURE_LIMIT) {
        const oldest = this.pictures.keys().next().value!;
        this.pictures.delete(oldest);
        this.loadedPictures.delete(oldest);
      }
      loading = this.loadPicture(src, this.overlay.ownerDocument).catch(() => undefined);
      this.pictures.set(src, loading);
      void loading.then((bitmap) => {
        if (this.pictures.get(src) !== loading) return;
        if (bitmap) this.loadedPictures.set(src, bitmap);
        else this.pictures.delete(src);
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

  protected following?: number;

  followGeometry() {
    if (this.following !== undefined) return;
    const moving = [...this.layers].filter((layer) => layer.drawable && layer.geometryAnimating);
    if (!moving.length) return;
    this.following = this.requestFrame(() => {
      this.following = undefined;
      for (const layer of moving) if (layer.drawable) layer.layout();
      this.followGeometry();
    });
  }

  protected restyle?: MutationObserver;

  protected restyleFrame?: number;

  watchStyles() {
    if (this.restyle) return;
    const doc = this.overlay.ownerDocument;
    const view = doc.defaultView as (Window & typeof globalThis) | null;
    const Observer = view?.MutationObserver;
    if (!view || !Observer) return;
    const styling = (node: Node | null) => {
      const element = node && node.nodeType === 1 ? (node as Element) : node?.parentElement;
      const name = element?.localName;
      return name === "style" || name === "link";
    };
    this.restyle = new Observer((records) => {
      const spans = [...this.layers].filter((layer) => layer.followsStyle).map((layer) => layer.span);
      if (!spans.length) return;
      const restyled = records.some((record) =>
        record.type === "attributes"
          ? spans.some((span) => record.target.contains(span))
          : styling(record.target) || Array.from(record.addedNodes).concat(Array.from(record.removedNodes)).some(styling),
      );
      if (restyled) this.scheduleRestyle();
    });
    this.restyle.observe(doc.documentElement, {
      attributes: true,
      attributeFilter: ["style", "class"],
      childList: true,
      characterData: true,
      subtree: true,
    });
    view.addEventListener("resize", () => this.scheduleRestyle());
    const media = (query: string) => {
      const list = typeof view.matchMedia === "function" ? view.matchMedia(query) : undefined;
      list?.addEventListener?.("change", () => this.scheduleRestyle());
    };
    media("(prefers-color-scheme: dark)");
    const resolution = () => {
      const list = typeof view.matchMedia === "function" ? view.matchMedia(`(resolution: ${view.devicePixelRatio || 1}dppx)`) : undefined;
      list?.addEventListener?.(
        "change",
        () => {
          this.scheduleRestyle();
          resolution();
        },
        { once: true },
      );
    };
    resolution();
  }

  scheduleRestyle() {
    if (this.restyleFrame !== undefined || ![...this.layers].some((layer) => layer.followsStyle)) return;
    this.restyleFrame = this.requestFrame(() => {
      this.restyleFrame = undefined;
      for (const layer of [...this.layers]) if (layer.followsStyle) layer.layout();
      this.followGeometry();
    });
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
    pictures: LayeredPicture[] = [],
  ): MorphLayer {
    const layer = new MorphLayer(this, span, content, background, kind, base, group, pictures);
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
  protected stills: StillPicture[] = [];
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
    protected pictures: LayeredPicture[] = [],
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

  protected loadingStill(index: number): boolean {
    return this.stills.some((still) => still.loading && index >= still.layer && index < still.layer + still.span);
  }

  protected staticLayer(index: number): string {
    if (this.loadingStill(index)) return "none";
    const image = this.images.find((entry) => index >= entry.layer && index < entry.layer + entry.span);
    const pending =
      !!image &&
      (image.slot.state === "idle" ||
        image.slot.state === "pending" ||
        (image.slot.state === "ready" && image.slot.artifact?.status === "live" && !image.view && !image.canvas && !image.broken));
    return pending && this.still && this.playback.animating ? (this.still[index] ?? this.layers[index]!) : this.layers[index]!;
  }

  showStill() {
    if ((!this.still && !this.stills.length) || this.frozen || this.disposed) return;
    if (this.shadowHost) {
      this.layout();
      return;
    }
    this.span.style.setProperty("background-image", this.layers.map((_, index) => this.staticLayer(index)).reverse().join(", "));
  }

  get geometryAnimating(): boolean {
    const animations = typeof this.span.getAnimations === "function" ? this.span.getAnimations() : [];
    return animations.some((animation) => {
      if (animation.playState !== "running") return false;
      const effect = animation.effect as KeyframeEffect | null;
      const keyframes = typeof effect?.getKeyframes === "function" ? effect.getKeyframes() : [];
      return keyframes.some((keyframe) => Object.keys(keyframe).some((name) => BACKGROUND_GEOMETRY.has(name.replace(/-/g, "").toLowerCase())));
    });
  }

  get followsStyle(): boolean {
    return !this.frozen && !this.disposed && this.stills.some((still) => still.canvas);
  }

  get live(): boolean {
    return !this.frozen && !this.disposed && this.images.some((image) => image.view || image.canvas);
  }

  get drawable(): boolean {
    return (
      !this.frozen &&
      !this.disposed &&
      this.kind === "background" &&
      (this.images.some((image) => image.slot.state === "ready" && image.slot.artifact?.status === "live") ||
        this.stills.some((still) => still.canvas))
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
        };
        this.images.push(image);
      }
      const key = [this.base, play.layer, play.owner ?? getImageThing(play.ref.image), play.morph, play.definition, this.content.epoch].join("|");
      image.plays.push({
        play,
        ...(this.kind === "background" ? { occurrence: this.playback.occurrenceFor(key, play.timing, play.owner) } : {}),
      });
    }
    this.playback.track(this);
    for (const image of this.images) image.slot.set(image.plays[0]!.play.ref);
    this.startStills();
    this.showStill();
  }

  protected startStills() {
    if (this.kind !== "background") return;
    for (const picture of this.pictures) {
      const end = picture.layer + picture.span;
      if (picture.span < 2 || picture.files.length !== picture.span || picture.layer < 0 || end > this.layers.length) continue;
      if (this.images.some((image) => image.layer < end && picture.layer < image.layer + image.span)) continue;
      const still: StillPicture = { layer: picture.layer, span: picture.span, picture };
      this.stills.push(still);
      const ready = picture.files.map((file) => this.playback.pictureNow(file.src));
      if (ready.every((bitmap) => bitmap)) this.settleStill(still, ready);
      else void this.loadStill(still);
    }
    if (this.stills.length) this.playback.watchStyles();
    if (this.stills.some((still) => still.files)) this.build();
  }

  protected async loadStill(still: StillPicture) {
    still.loading = true;
    const loaded = await Promise.all(still.picture.files.map((file) => this.playback.picture(file.src)));
    still.loading = false;
    if (!this.active) return;
    this.settleStill(still, loaded);
    if (still.files) this.build();
    this.showStill();
  }

  protected settleStill(still: StillPicture, loaded: (PictureBitmap | undefined)[]) {
    const bottom = loaded[0];
    if (
      !bottom ||
      loaded.some(
        (bitmap) =>
          !bitmap ||
          bitmap.animated ||
          bitmap.profile ||
          bitmap.unread ||
          bitmap.width !== bottom.width ||
          bitmap.height !== bottom.height,
      )
    ) {
      still.broken = true;
      return;
    }
    still.files = { bitmaps: new Map(loaded.map((bitmap, index) => [index, bitmap!])), width: bottom.width, height: bottom.height };
    const computed = this.span.ownerDocument.defaultView?.getComputedStyle(this.span);
    if (!this.stillPlans(still, computed)) still.broken = true;
  }

  get occurrenceKeys(): string[] {
    return this.images.flatMap((image) => image.plays.flatMap((p) => (p.occurrence ? [p.occurrence.key] : [])));
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
    }
    const ready = this.images.filter(
      (image) =>
        image.slot.state === "ready" &&
        image.slot.artifact?.status === "live" &&
        (!image.picture || (!!image.files && !image.broken)),
    );
    const stills = this.stills.filter((still) => still.files && !still.broken);
    if (!ready.length && !stills.length) {
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
        const files = state.files!;
        const canvas = this.pictureRect(files, i, computed) ? this.canvasView(files, layeredMorphDrawn(files.model), doc) : undefined;
        if (canvas) {
          state.canvas = canvas;
          root.appendChild(canvas.box);
        } else {
          if (this.pictureRect(files, i, computed)) state.broken = true;
          for (let k = 0; k < span; k++) still(i + k);
        }
        i += span - 1;
        continue;
      }
      const picture = state ? undefined : stills.find((entry) => entry.layer === i);
      if (picture) {
        const span = Math.min(picture.span, count - i);
        const files = picture.files!;
        const drawn = [...files.bitmaps.keys()].map((file) => ({ file, opacity: 1 }));
        const canvas = picture.canvas ?? this.canvasView(files, drawn, doc);
        if (canvas) {
          picture.canvas = canvas;
          root.appendChild(canvas.box);
          this.sizeObjects(picture);
        } else {
          picture.broken = true;
          for (let k = 0; k < span; k++) still(i + k);
        }
        i += span - 1;
        continue;
      }
      const view =
        state && !state.broken && this.placement(state.slot.artifact!, computed, count - 1 - i)
          ? this.liveView(state, doc)
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
    this.span.style.setProperty("background-image", this.layers.map(() => "none").join(", "));
    this.layout();
    this.render();
  }

  protected layerBoxes(computed: CSSStyleDeclaration | undefined): LayerBoxes {
    const area = positioningArea(this.span, computed);
    const px = (name: string) => Number.parseFloat(computed?.getPropertyValue(name) ?? "") || 0;
    const width = Number.isFinite(area.width) ? area.width : 0;
    const height = Number.isFinite(area.height) ? area.height : 0;
    const [bl, br, bt, bb] = ["left", "right", "top", "bottom"].map((side) => px(`border-${side}-width`)) as [number, number, number, number];
    const [pl, pr, pt, pb] = ["left", "right", "top", "bottom"].map((side) => px(`padding-${side}`)) as [number, number, number, number];
    return {
      border: { x: 0 - bl, y: 0 - bt, width: width + bl + br, height: height + bt + bb },
      padding: { x: 0, y: 0, width, height },
      content: { x: pl, y: pt, width: Math.max(0, width - pl - pr), height: Math.max(0, height - pt - pb) },
    };
  }

  protected coversBorder(boxes: LayerBoxes): boolean {
    return this.images.length === 0 && (boxes.border.width > boxes.padding.width || boxes.border.height > boxes.padding.height);
  }

  protected stillPlans(still: StillPicture, computed: CSSStyleDeclaration | undefined): LayerPaint[] | undefined {
    const files = still.files;
    if (!files) return undefined;
    const boxes = this.layerBoxes(computed);
    const count = this.layers.length;
    const value = (name: string, k: number) => (computed ? layerValue(computed.getPropertyValue(name), count - 1 - (still.layer + k)) : "");
    const plans: LayerPaint[] = [];
    for (let k = 0; k < still.span; k++) {
      const plan = layerPaint(
        {
          size: value("background-size", k),
          position: value("background-position", k),
          repeat: value("background-repeat", k) || "no-repeat",
          origin: value("background-origin", k),
          clip: value("background-clip", k),
          blend: value("background-blend-mode", k),
        },
        boxes,
        { width: files.width, height: files.height },
      );
      if (!plan) return undefined;
      plans.push(plan);
    }
    return plans;
  }

  protected placeStill(still: StillPicture, computed: CSSStyleDeclaration | undefined) {
    const view = still.canvas;
    const files = still.files;
    const plans = this.stillPlans(still, computed);
    if (!view || !files || !plans) return;
    const boxes = this.layerBoxes(computed);
    const area = this.coversBorder(boxes) ? boxes.border : boxes.padding;
    if (!(area.width > 0 && area.height > 0)) return;
    const win = this.span.ownerDocument.defaultView;
    const dpr = win?.devicePixelRatio && win.devicePixelRatio > 0 ? win.devicePixelRatio : 1;
    let left = 0;
    let top = 0;
    let { width, height } = area;
    const host = this.shadowHost;
    const bounds = host?.getBoundingClientRect();
    if (host && bounds && host.offsetWidth > 0 && Math.abs(bounds.width - host.offsetWidth) < 0.5) {
      const snap = (value: number) => Math.round(value * dpr) / dpr;
      left = snap(bounds.left) - bounds.left;
      top = snap(bounds.top) - bounds.top;
      width = snap(bounds.left + width) - bounds.left - left;
      height = snap(bounds.top + height) - bounds.top - top;
    }
    const tiles = plans.flatMap((plan) => [...plan.tiles, ...(plan.pattern ? [plan.pattern.tile] : [])]);
    const resolution = Math.max(0, ...tiles.map((tile) => (tile.width > 0 ? files.width / tile.width : 0)));
    const scale = Math.max(1, Math.min(pictureZoomReach(this.span), resolution / dpr));
    const pixels = Math.max(1, width * dpr * scale) * Math.max(1, height * dpr * scale);
    const shrink = pixels > MAX_CANVAS_PIXELS ? Math.sqrt(MAX_CANVAS_PIXELS / pixels) : 1;
    const w = Math.max(1, Math.round(width * dpr * scale * shrink));
    const h = Math.max(1, Math.round(height * dpr * scale * shrink));
    const bottomBlend = plans[0]!.blend;
    const blended = still.layer > 0 && bottomBlend !== "normal" ? `;mix-blend-mode:${bottomBlend}` : "";
    const style = `position:absolute;left:${left}px;top:${top}px;width:${width}px;height:${height}px${blended}`;
    if (view.box.getAttribute("style") !== style) view.box.setAttribute("style", style);
    if (view.canvas.width !== w || view.canvas.height !== h) {
      view.canvas.width = w;
      view.canvas.height = h;
      view.painted = undefined;
    }
    const color = computed?.getPropertyValue("background-color").trim() ?? "";
    const compact = color.replace(/ /g, "");
    const opaque = color !== "" && color !== "transparent" && !(compact.startsWith("rgba(") && compact.endsWith(",0)"));
    const fill = still.layer === 0 && opaque && plans.some((plan) => plan.blend !== "normal") ? color : undefined;
    view.still = { plans, left: area.x + left, top: area.y + top, unitX: w / width, unitY: h / height, ...(fill ? { fill } : {}) };
    this.paint(view);
  }

  protected paintStill(view: CanvasView, still: StillPaint) {
    const { canvas, context } = view;
    const smooth = view.smooth !== false;
    const device = (r: Rect): Rect => {
      const x = Math.round((r.x - still.left) * still.unitX);
      const y = Math.round((r.y - still.top) * still.unitY);
      return {
        x,
        y,
        width: Math.round((r.x + r.width - still.left) * still.unitX) - x,
        height: Math.round((r.y + r.height - still.top) * still.unitY) - y,
      };
    };
    const plans = still.plans.map((plan) => ({
      blend: plan.blend,
      clip: device(plan.clip),
      tiles: plan.tiles.map(device),
      pattern: plan.pattern
        ? {
            repeatX: plan.pattern.repeatX,
            repeatY: plan.pattern.repeatY,
            bands: (plan.pattern.repeatX && plan.pattern.repeatY
              ? [plan.pattern.tile]
              : plan.tiles.filter((tile, index, all) =>
                  plan.pattern!.repeatX
                    ? all.findIndex((other) => other.y === tile.y) === index
                    : all.findIndex((other) => other.x === tile.x) === index,
                )
            ).map((tile) => ({
              x: (tile.x - still.left) * still.unitX,
              y: (tile.y - still.top) * still.unitY,
              width: tile.width * still.unitX,
              height: tile.height * still.unitY,
            })),
          }
        : undefined,
    }));
    const key = `${canvas.width}x${canvas.height}|${smooth}|${still.fill ?? ""}|${JSON.stringify(plans)}`;
    if (view.painted === key) return;
    view.painted = key;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalAlpha = 1;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = smooth;
    const covers = (r: Rect) => r.x <= 0 && r.y <= 0 && r.x + r.width >= canvas.width && r.y + r.height >= canvas.height;
    if (still.fill && context.fillRect) {
      const clip = plans[0]!.clip;
      context.fillStyle = still.fill;
      context.fillRect(clip.x, clip.y, clip.width, clip.height);
    }
    const Matrix = this.span.ownerDocument.defaultView?.DOMMatrix;
    plans.forEach((plan, index) => {
      const bitmap = view.files.bitmaps.get(index);
      if (!bitmap) return;
      const clipped = !covers(plan.clip) && !!(context.save && context.beginPath && context.rect && context.clip && context.restore);
      if (clipped) {
        context.save!();
        context.beginPath!();
        context.rect!(plan.clip.x, plan.clip.y, plan.clip.width, plan.clip.height);
        context.clip!();
      }
      if ("globalCompositeOperation" in context) context.globalCompositeOperation = plan.blend === "normal" ? "source-over" : plan.blend;
      const pattern = plan.pattern;
      const sample = pattern?.bands[0] ?? plan.tiles[0];
      if ("imageSmoothingQuality" in context) context.imageSmoothingQuality = sample && sample.width < bitmap.width ? "high" : "low";
      const repetition = pattern ? (pattern.repeatX && pattern.repeatY ? "repeat" : pattern.repeatX ? "repeat-x" : "repeat-y") : "";
      const patterns = pattern && context.createPattern && context.fillRect && Matrix ? pattern.bands.map(() => context.createPattern!(bitmap.image, repetition)) : [];
      if (pattern && patterns.length && patterns.every((fill) => fill)) {
        for (const [index, band] of pattern.bands.entries()) {
          const fill = patterns[index]!;
          fill.setTransform(new Matrix!([band.width / bitmap.width, 0, 0, band.height / bitmap.height, band.x, band.y]));
          context.fillStyle = fill;
          const x = Math.round(band.x);
          const y = Math.round(band.y);
          context.fillRect!(
            pattern.repeatX ? plan.clip.x : x,
            pattern.repeatY ? plan.clip.y : y,
            pattern.repeatX ? plan.clip.width : Math.round(band.x + band.width) - x,
            pattern.repeatY ? plan.clip.height : Math.round(band.y + band.height) - y,
          );
        }
      } else {
        for (const tile of plan.tiles) {
          if (tile.width > 0 && tile.height > 0) context.drawImage(bitmap.image, tile.x, tile.y, tile.width, tile.height);
        }
      }
      if (clipped) context.restore!();
    });
    if ("globalCompositeOperation" in context) context.globalCompositeOperation = "source-over";
  }

  protected sizeObjects(still: StillPicture) {
    const files = still.files;
    if (!files) return;
    const srcs = new Set(still.picture.files.map((file) => file.src));
    const view = this.span.ownerDocument.defaultView;
    for (const img of Array.from(this.span.querySelectorAll<HTMLElement>(":scope > img.object"))) {
      if (!srcs.has(img.getAttribute("src") ?? "") || img.style.getPropertyValue("aspect-ratio")) continue;
      const authored = view?.getComputedStyle(img).getPropertyValue("aspect-ratio");
      if (authored && authored !== "auto") continue;
      img.style.setProperty("aspect-ratio", `auto ${files.width} / ${files.height}`);
    }
  }

  protected unbuild() {
    if (!this.shadowHost) return;
    this.shadowHost.remove();
    this.shadowHost = undefined;
    this.statics = [];
    this.span.style.setProperty("background-image", this.layers.map((layer, index) => (this.loadingStill(index) ? "none" : layer)).reverse().join(", "));
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

  protected liveView(state: ImageState, doc: Document): LiveView | undefined {
    const artifact = state.slot.artifact!;
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

  protected pictureRect(
    files: PictureFiles | undefined,
    layer: number,
    computed: CSSStyleDeclaration | undefined,
    area = { width: 100, height: 100 },
  ) {
    if (!files) return undefined;
    const size = { width: files.width, height: files.height, ratio: files.width / files.height };
    return this.rectFor(size, computed, this.layers.length - 1 - layer, area);
  }

  protected canvasView(files: PictureFiles, drawn: LayeredMorphDrawn[], doc: Document): CanvasView | undefined {
    const canvas = doc.createElement("canvas");
    const context = this.playback.pictureCanvas(canvas);
    if (!context) return undefined;
    canvas.setAttribute("style", "position:absolute;inset:0;width:100%;height:100%;display:block");
    const box = doc.createElement("div");
    box.setAttribute("style", "position:absolute;left:0;top:0;width:0;height:0");
    box.appendChild(canvas);
    return { box, canvas, context, files, drawn };
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
    const scale = Math.max(1, Math.min(pictureZoomReach(this.span), view.files.width / Math.max(1, width * dpr)));
    const pixels = Math.max(1, width * dpr * scale) * Math.max(1, height * dpr * scale);
    const shrink = pixels > MAX_CANVAS_PIXELS ? Math.sqrt(MAX_CANVAS_PIXELS / pixels) : 1;
    const w = Math.max(1, Math.round(width * dpr * scale * shrink));
    const h = Math.max(1, Math.round(height * dpr * scale * shrink));
    if (view.canvas.width !== w || view.canvas.height !== h) {
      view.canvas.width = w;
      view.canvas.height = h;
      view.painted = undefined;
    }
    this.paint(view);
  }

  protected paint(view: CanvasView) {
    if (view.still) {
      this.paintStill(view, view.still);
      return;
    }
    const { canvas, context } = view;
    const smooth = view.smooth !== false;
    const key = `${canvas.width}x${canvas.height}|${smooth}|${view.drawn.map(({ file, opacity }) => `${file}:${opacity}`).join(",")}`;
    if (view.painted === key) return;
    view.painted = key;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalAlpha = 1;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = smooth;
    for (const { file, opacity } of view.drawn) {
      const bitmap = view.files.bitmaps.get(file);
      if (!bitmap) continue;
      context.globalAlpha = opacity;
      context.drawImage(bitmap.image, 0, 0, canvas.width, canvas.height);
    }
    context.globalAlpha = 1;
  }

  layout() {
    if (!this.shadowHost) return;
    const computed = this.span.ownerDocument.defaultView?.getComputedStyle(this.span);
    const count = this.layers.length;
    for (const state of this.images) {
      const artifact = state.slot.state === "ready" ? state.slot.artifact : undefined;
      if (!artifact || artifact.status !== "live" || state.broken || (state.picture && !state.files)) continue;
      const eligible = state.picture
        ? !!this.pictureRect(state.files, state.layer, computed)
        : !!this.placement(artifact, computed, count - 1 - state.layer);
      if (eligible !== !!(state.picture ? state.canvas : state.view)) {
        this.build();
        return;
      }
    }
    const boxes = this.layerBoxes(computed);
    const cover = this.coversBorder(boxes);
    const bl = boxes.padding.x - boxes.border.x;
    const bt = boxes.padding.y - boxes.border.y;
    const br = boxes.border.width - boxes.padding.width - bl;
    const bb = boxes.border.height - boxes.padding.height - bt;
    const hostStyle = cover ? HOST_STYLE.replace("inset:0", `inset:${-bt}px ${-br}px ${-bb}px ${-bl}px`) : HOST_STYLE;
    if (this.shadowHost.getAttribute("style") !== hostStyle) this.shadowHost.setAttribute("style", hostStyle);
    const frame = cover ? `top:${bt}px;right:${br}px;bottom:${bb}px;left:${bl}px` : "inset:0";
    for (const { div, layer } of this.statics) {
      const style = `position:absolute;${frame};background-image:${this.staticLayer(layer)};${this.layerStyle(computed, count - 1 - layer)}`;
      if (div.getAttribute("style") !== style) div.setAttribute("style", style);
    }
    const area = positioningArea(this.span, computed);
    if (!(area.width > 0 && area.height > 0)) return;
    const rendering = computed?.getPropertyValue("image-rendering") ?? "";
    const smooth = rendering !== "pixelated" && rendering !== "crisp-edges";
    for (const view of [...this.stills.map((still) => still.canvas), ...this.images.map((image) => image.canvas)]) {
      if (view) view.smooth = smooth;
    }
    for (const still of this.stills) {
      if (still.canvas) this.placeStill(still, computed);
    }
    for (const state of this.images) {
      if (state.canvas) {
        const rect = this.pictureRect(state.files, state.layer, computed, area);
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
      const target = image.view ?? image.canvas;
      const artifact = image.view?.artifact ?? (image.canvas ? image.slot.artifact : undefined);
      if (!target || !artifact || !image.plays.some((p) => p.occurrence)) continue;
      const heads = image.plays.map(({ occurrence }) => {
        const head = occurrence ? this.playback.playhead(occurrence) : undefined;
        return head && "offset" in head ? head.offset : ("rest" as const);
      });
      const signature = heads.join(",");
      if (target.last === signature) continue;
      target.last = signature;
      const offsets: Record<string, number> = Object.create(null);
      image.plays.forEach(({ play }, i) => {
        const at = heads[i]!;
        if (at !== "rest") offsets[play.morph] = at;
      });
      const frame = Object.keys(offsets).length ? morphFrameState(artifact, morphPosesAt(artifact, offsets)) : restFrame();
      if (image.canvas) {
        if (image.files) {
          image.canvas.drawn = layeredMorphDrawn(image.files.model, frame);
          this.paint(image.canvas);
        }
        continue;
      }
      const view = image.view!;
      applyFrame(view, frame);
      image.plays.forEach(({ play }, i) => this.moveLayers(view, play, heads[i]!));
    }
  }

  protected moveLayers(view: LiveView, play: MorphLayerPlay, at: number | "rest") {
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
      for (const motion of image.view?.motions ?? []) motion.effect?.cancel();
    }
  }

  freeze() {
    if (this.frozen || this.disposed) return;
    this.frozen = true;
    for (const image of this.images) {
      for (const entry of image.plays) {
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
    }
    for (const still of this.stills) still.canvas = undefined;
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
