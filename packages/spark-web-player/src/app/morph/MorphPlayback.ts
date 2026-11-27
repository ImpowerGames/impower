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
  renderMorphAt,
  type MorphFrameState,
  type MorphGroupPose,
} from "../../../../sparkdown/src/morph/render";
import {
  layeredMorphDrawn,
  layeredMorphMotions,
  layeredMorphModel,
  type LayeredMorphDrawn,
  type LayeredMorphModel,
} from "../../../../sparkdown/src/morph/layered";
import { morphEasingJumps, parseMorphEasing, type MorphEasing } from "../../../../sparkdown/src/morph/easing";
import { hashText } from "../../../../sparkdown/src/morph/hash";
import { morphMotionKeyframes, type MorphMotionFrame } from "../../../../sparkdown/src/morph/motion";
import { own } from "../../../../sparkdown/src/morph/own";
import { MorphBakeService } from "../../../../sparkdown/src/morph/service";
import { MorphTimeline, morphRandom } from "../../../../sparkdown/src/morph/timeline";
import type { MorphArtifact, MorphRef, MorphTiming } from "../../../../sparkdown/src/morph/types";
import type { MorphStillParams } from "../../../../spark-engine/src/game/modules/ui/classes/messages/MorphStillMessage";
import type {
  LayeredPicture,
  MorphImageContent,
  MorphLayerPlay,
  MorphPicture,
  MorphPlay,
} from "../../../../spark-engine/src/game/modules/ui/classes/messages/WriteImageMessage";
import { pictureViewOf, pictureZoomReach } from "../../../../spark-dom/src/utils/placePicture";
import { backgroundRect, cssList, layerValue, svgIntrinsicSize, type Rect } from "./backgroundFit";
import { IDENTITY, multiply, type Affine } from "../../../../sparkdown/src/morph/affine";
import { computedMotionPose, type MotionBox, type MotionPose } from "./motionPose";
import { cssLength, layerPaint, splitTopLevel, type LayerBoxes, type LayerPaint } from "./pictureLayers";
import { dataUrlBytes, pictureFileComplete, pictureFileTraits, streamInflate } from "./pictureFileTraits";
import { browserSvgLayerRasterizer, readSvgLayer, type SvgLayerRaster, type SvgLayerRasterizer, type SvgLayerSource } from "./svgLayerFile";

export type { MorphImageContent, MorphLayerPlay };

export interface PictureBitmap {
  image: CanvasImageSource;
  width: number;
  height: number;
  animated?: boolean;
  profile?: boolean;
  unread?: boolean;
  box?: Rect;
  unsized?: boolean;
  styled?: string;
  vector?: SvgLayerSource;
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
  roundRect?(x: number, y: number, width: number, height: number, radii: { x: number; y: number }[]): void;
  clip?(): void;
  fillRect?(x: number, y: number, width: number, height: number): void;
  createPattern?(image: CanvasImageSource, repetition: string): CanvasPattern | null;
}

export type PictureCanvasFactory = (canvas: HTMLCanvasElement) => PictureCanvasContext | null | undefined;

export type OutlineEncoder = (canvas: HTMLCanvasElement) => Promise<{ url: string; release(): void } | undefined>;

function outlineWorker(scope: { onmessage: ((event: MessageEvent) => void) | null; postMessage(message: unknown): void }) {
  scope.onmessage = async (event: MessageEvent) => {
    const { id, image } = event.data as { id: number; image: ImageBitmap };
    try {
      const canvas = new OffscreenCanvas(image.width, image.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("no context");
      context.drawImage(image, 0, 0);
      image.close();
      scope.postMessage({ id, blob: await canvas.convertToBlob({ type: "image/png" }) });
    } catch {
      image.close();
      scope.postMessage({ id });
    }
  };
}

const OUTLINE_WORKER_IDLE_MS = 5000;
const OUTLINE_WORKER_ANSWER_MS = 5000;

type OutlineWorkerEncode = (canvas: HTMLCanvasElement) => Promise<Blob | undefined>;

const outlineWorkers = new WeakMap<Window, OutlineWorkerEncode | null>();

export function workerOutlineEncode(view: Window & typeof globalThis): OutlineWorkerEncode | undefined {
  const known = outlineWorkers.get(view);
  if (known !== undefined) return known ?? undefined;
  if (
    typeof view.Worker !== "function" ||
    typeof view.Blob !== "function" ||
    typeof view.URL?.createObjectURL !== "function" ||
    typeof view.createImageBitmap !== "function" ||
    typeof (view as unknown as { OffscreenCanvas?: unknown }).OffscreenCanvas !== "function"
  ) {
    outlineWorkers.set(view, null);
    return undefined;
  }
  let worker: Worker | undefined;
  let broken = false;
  let next = 0;
  let idle: number | undefined;
  const pending = new Map<number, { settle: (blob: Blob | undefined) => void; deadline: number }>();
  const stop = () => {
    if (idle !== undefined) view.clearTimeout(idle);
    idle = undefined;
    worker?.terminate();
    worker = undefined;
  };
  const fail = () => {
    broken = true;
    stop();
    const waiting = [...pending.values()];
    pending.clear();
    for (const request of waiting) {
      view.clearTimeout(request.deadline);
      request.settle(undefined);
    }
  };
  const settled = () => {
    if (pending.size === 0 && worker) idle = view.setTimeout(stop, OUTLINE_WORKER_IDLE_MS);
  };
  const start = (): Worker | undefined => {
    if (worker || broken) return worker;
    let url: string | undefined;
    try {
      url = view.URL.createObjectURL(new view.Blob([`(${outlineWorker.toString()})(self);\n`], { type: "text/javascript" }));
      worker = new view.Worker(url);
    } catch {
      fail();
      return undefined;
    } finally {
      if (url !== undefined) view.URL.revokeObjectURL(url);
    }
    worker.onerror = fail;
    worker.onmessageerror = fail;
    worker.onmessage = (event: MessageEvent) => {
      const { id, blob } = event.data as { id: number; blob?: Blob };
      const request = pending.get(id);
      if (!request) return;
      pending.delete(id);
      view.clearTimeout(request.deadline);
      request.settle(blob);
      settled();
    };
    return worker;
  };
  const encode: OutlineWorkerEncode = async (canvas) => {
    if (broken) return undefined;
    let image: ImageBitmap;
    try {
      image = await view.createImageBitmap(canvas);
    } catch {
      return undefined;
    }
    if (idle !== undefined) view.clearTimeout(idle);
    idle = undefined;
    const target = start();
    if (!target) {
      image.close();
      return undefined;
    }
    const id = ++next;
    return new Promise((resolve) => {
      const deadline = view.setTimeout(fail, OUTLINE_WORKER_ANSWER_MS);
      pending.set(id, { settle: resolve, deadline });
      try {
        target.postMessage({ id, image }, [image]);
      } catch {
        pending.delete(id);
        view.clearTimeout(deadline);
        image.close();
        settled();
        resolve(undefined);
      }
    });
  };
  outlineWorkers.set(view, encode);
  return encode;
}

export const browserOutlineEncoder: OutlineEncoder = async (canvas) => {
  const doc = canvas.ownerDocument;
  const view = doc.defaultView as (Window & typeof globalThis) | null;
  const urls = view?.URL;
  if (!view || typeof urls?.createObjectURL !== "function") return undefined;
  const pending = workerOutlineEncode(view)?.(canvas);
  const blob =
    (await pending) ??
    (typeof canvas.toBlob === "function"
      ? await new Promise<Blob | null>((resolve) => {
          try {
            canvas.toBlob(resolve, "image/png");
          } catch {
            resolve(null);
          }
        })
      : null);
  if (!blob) return undefined;
  const url = urls.createObjectURL(blob);
  await decodeImage(doc, url);
  return { url, release: () => urls.revokeObjectURL(url) };
};

interface Outline {
  key: string;
  width: number;
  height: number;
  users: number;
  ready: Promise<string | undefined>;
  url?: string;
  release?: () => void;
}

type OutlineSource =
  | { state: "waiting" | "none" | "css" }
  | { state: "ready"; key: string; width: number; height: number; natural: { width: number; height: number }; draw: (context: PictureCanvasContext) => void };

interface OutlineLayer {
  bitmap: PictureBitmap;
  raster?: { image?: CanvasImageSource; width: number; height: number };
}

interface MaskOutline {
  picture: LayeredPicture;
  state: "waiting" | "none" | "css" | "shown";
  shown?: Outline;
  pending?: Outline;
  natural?: { width: number; height: number };
  late?: boolean;
}

const HIDDEN_MASK = "linear-gradient(transparent, transparent)";

interface PictureFiles {
  bitmaps: Map<number, PictureBitmap>;
  width: number;
  height: number;
  rasters: Map<number, FileRaster>;
  released?: boolean;
}

interface FileRaster {
  image: CanvasImageSource;
  release(): void;
  width: number;
  height: number;
  want?: { width: number; height: number };
  busy?: boolean;
  refused?: string;
}

interface MorphPictureFiles extends PictureFiles {
  model: LayeredMorphModel;
}

interface StillPicture {
  layer: number;
  span: number;
  picture: LayeredPicture;
  files?: PictureFiles;
  canvases?: StillCanvas[];
  segments?: string;
  loading?: boolean;
  broken?: boolean;
  rasters: Map<number, StillRaster>;
  undrawn?: Undrawn;
  late?: boolean;
  under?: ImageState;
  reported?: boolean;
  next?: { boxSize: string; rasters: Map<number, StillRaster>; refused?: Undrawn };
}

interface StillRaster {
  image?: CanvasImageSource;
  release?: () => void;
  width: number;
  height: number;
  want?: { width: number; height: number };
  busy?: boolean;
}

export type UndrawnReason = "unread" | "unsized" | "undrawn" | "styled" | "late";

interface Undrawn {
  reason: UndrawnReason;
  file: string;
  declaration?: string;
}

const UNDRAWN_LINES: Record<UndrawnReason, string> = {
  unread: "Its file could not be read.",
  unsized: "Its SVG has no size of its own.",
  undrawn: "The browser would not draw it at this size.",
  styled: "Its SVG root has styling the player cannot draw.",
  late: "It was not drawn in time.",
};

const SETTLE_MS = 250;

interface StillPaint {
  plans: LayerPaint[];
  layers: number[];
  left: number;
  top: number;
  unitX: number;
  unitY: number;
  backing: { w: number; h: number };
}

interface StillSegment {
  blend: string;
  layers: number[];
}

const STYLE_KEYS = [
  "width",
  "height",
  "box-sizing",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-right-radius",
  "border-bottom-left-radius",
  "background-size",
  "background-position",
  "background-repeat",
  "background-origin",
  "background-clip",
  "background-blend-mode",
  "background-color",
  "background-attachment",
  "image-rendering",
];

interface StillCanvas {
  box: HTMLElement;
  canvas: HTMLCanvasElement;
  context: PictureCanvasContext;
  files: PictureFiles;
  segment: StillSegment;
  smooth?: boolean;
  painted?: string;
  still?: StillPaint;
  boxSize?: string;
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
  containers: Map<number, Container>;
  files: MorphPictureFiles;
  drawn: LayeredMorphDrawn[];
  standIns: Map<string, StandIn>;
  groups: { canvas: HTMLCanvasElement; context: PictureCanvasContext }[];
  size?: { width: number; height: number };
  smooth?: boolean;
  last?: string;
  snap?: { x: number; y: number; width: number; height: number; rect: string };
  next?: { rect: string; w: number; h: number; rasters: Map<number, FileRaster>; pending: number; refused?: number };
}

interface Container {
  element: HTMLElement;
  label: string;
}

const CONTAINER_STYLE = "position:absolute;inset:0";

interface PaintedLayer {
  file: number;
  alpha: number;
  matrix?: Affine;
  wrappers: number[];
  fades: number[];
}

interface StandIn {
  element: HTMLElement;
  effect?: MorphMotionEffect | null;
  pose?: MotionPose;
}

export type MorphPoseReader = (element: Element, box: MotionBox) => MotionPose | undefined;

export const browserPictureLoader: PictureLoader = async (src, doc) => {
  const view = doc.defaultView as (Window & typeof globalThis) | null;
  const Img = view?.Image;
  if (!view || !Img) return undefined;
  const img = new Img();
  img.decoding = "async";
  img.src = src;
  let decoded = true;
  try {
    await img.decode();
  } catch {
    decoded = false;
  }
  const bytes = await readPictureBytes(src, view);
  const traits = bytes ? await pictureFileTraits(bytes, streamInflate(view)) : undefined;
  const svg = bytes && traits?.svg && view.DOMParser ? readSvgLayer(new TextDecoder().decode(bytes), new view.DOMParser(), { view, natural: { width: img.naturalWidth, height: img.naturalHeight } })
      : undefined;
  const size = { image: img, width: img.naturalWidth, height: img.naturalHeight };
  if (svg && "reason" in svg) {
    return { ...size, animated: svg.reason === "animated", unread: svg.reason === "unread", unsized: svg.reason === "unsized", ...(svg.reason === "styled" ? { styled: svg.declaration } : {}) };
  }
  if (!(img.naturalWidth > 0 && img.naturalHeight > 0)) return undefined;
  if (!decoded && !(img.complete && paintsAnything(img, img.naturalWidth, img.naturalHeight, doc))) return undefined;
  if (bytes && !pictureFileComplete(bytes)) return undefined;
  if (!traits) return { ...size, unread: true };
  return { ...size, animated: traits.animated, profile: traits.profile, ...(traits.unread ? { unread: true } : {}), ...(svg ? { vector: svg.source } : {}) };
};

const PAINT_PROBE_BAND_PIXELS = 1 << 20;

export function paintsAnything(image: CanvasImageSource, width: number, height: number, doc: Document): boolean {
  const shrink = width * height > MAX_CANVAS_PIXELS ? Math.sqrt(MAX_CANVAS_PIXELS / (width * height)) : 1;
  const canvas = doc.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * shrink));
  canvas.height = Math.max(1, Math.round(height * shrink));
  try {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return false;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const band = Math.max(1, Math.floor(PAINT_PROBE_BAND_PIXELS / canvas.width));
    for (let top = 0; top < canvas.height; top += band) {
      const pixels = context.getImageData(0, top, canvas.width, Math.min(band, canvas.height - top)).data;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i]! > 0) return true;
    }
  } catch {
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
  return false;
}

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
  resume?: { offset: number; skip: number; from: number };
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
  commit?(): void;
}

export type MorphMotionAnimator = (element: Element, keyframes: Keyframe[]) => MorphMotionEffect | undefined;

const MOTION_DURATION = 1000;

export const browserAnimator: MorphMotionAnimator = (element, keyframes) => {
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
    commit: () => animation.commitStyles(),
  };
};

interface FileState {
  file: number;
  slot: MorphArtifactSlot;
  plays: { play: MorphPlay; occurrence?: Occurrence }[];
  view?: LiveView;
  broken?: boolean;
}

interface ImageState {
  layer: number;
  span: number;
  picture?: MorphPicture;
  slot: MorphArtifactSlot;
  plays: { play: MorphLayerPlay; occurrence?: Occurrence; started?: true }[];
  drawn?: MorphRef;
  turned?: boolean;
  resume?: number;
  inner: FileState[];
  view?: LiveView;
  canvas?: CanvasView;
  files?: MorphPictureFiles;
  loading?: { artifact: MorphArtifact; done: Promise<void> };
  broken?: boolean;
  reported?: boolean;
  pendingReports?: MorphStillParams[];
  poses?: PoseFrames;
}

type PoseHead = number | "rest";

interface PoseFrame {
  offsets: Record<string, number>;
  motions: { play: number; offset: number }[];
  raster?: SvgLayerRaster;
  refused?: boolean;
}

interface PoseSet {
  width: number;
  height: number;
  grids: (number | undefined)[];
  cut: Set<string>;
  keys: Map<string, string>;
  frames: Map<string, PoseFrame>;
  queue: string[];
  running: boolean;
  released?: boolean;
}

interface PoseFrames {
  artifact: MorphArtifact;
  still: StillPicture;
  sets: PoseSet[];
  shown: string;
  showing?: PoseSet;
  last?: string;
  reported?: boolean;
}

const REST_POSE = "rest";

const FRAME_BYTES_PER_PIXEL = 4;

const MAX_POSE_FRAMES = 256;

const MAX_POSE_COMBINATIONS = 1024;

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
  readPose?: MorphPoseReader;
  rasterizeSvgLayer?: SvgLayerRasterizer;
  encodeOutline?: OutlineEncoder;
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
  readPose: MorphPoseReader;
  rasterizeSvgLayer: SvgLayerRasterizer;
  encodeOutline: OutlineEncoder;
  frameRate = 24;
  frameBudget?: () => number;
  reportStill?: (params: MorphStillParams) => void;
  reportChangeBake?: (ref: MorphRef, artifact: MorphArtifact) => void;
  keepWhole?: (srcs: string[]) => void;
  residentPicture?: (src: string) => PictureBitmap | undefined;
  placeholders = false;
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
    this.readPose = options.readPose ?? computedMotionPose;
    this.rasterizeSvgLayer = options.rasterizeSvgLayer ?? browserSvgLayerRasterizer;
    this.encodeOutline = options.encodeOutline ?? browserOutlineEncoder;
    const host =(view ?? window) as Window & typeof globalThis;
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
    if (options.readPose) this.readPose = options.readPose;
    if (options.rasterizeSvgLayer) this.rasterizeSvgLayer = options.rasterizeSvgLayer;
    if (options.encodeOutline) this.encodeOutline = options.encodeOutline;
  }

  protected outlines = new Map<string, Outline>();
  protected static readonly IDLE_OUTLINES = 8;

  outline(source: Extract<OutlineSource, { state: "ready" }>): Outline {
    const known = this.outlines.get(source.key);
    if (known) {
      this.outlines.delete(source.key);
      this.outlines.set(source.key, known);
      known.users += 1;
      return known;
    }
    const outline: Outline = { key: source.key, width: source.width, height: source.height, users: 1, ready: Promise.resolve(undefined) };
    this.outlines.set(source.key, outline);
    const canvas = this.overlay.ownerDocument.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const context = this.pictureCanvas(canvas);
    if (context) {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.globalAlpha = 1;
      context.clearRect(0, 0, source.width, source.height);
      context.imageSmoothingEnabled = true;
      if ("imageSmoothingQuality" in context) context.imageSmoothingQuality = "high";
      source.draw(context);
      outline.ready = this.encodeOutline(canvas)
        .catch(() => undefined)
        .then((encoded) => {
          canvas.width = 0;
          canvas.height = 0;
          if (!encoded) return undefined;
          if (this.outlines.get(source.key) !== outline) {
            encoded.release();
            return undefined;
          }
          outline.url = encoded.url;
          outline.release = encoded.release;
          return encoded.url;
        });
    }
    this.trimOutlines();
    return outline;
  }

  releaseOutline(outline: Outline) {
    outline.users -= 1;
    this.trimOutlines();
  }

  protected trimOutlines() {
    const idle = [...this.outlines.values()].filter((outline) => outline.users <= 0);
    for (const outline of idle.slice(0, Math.max(0, idle.length - MorphPlayback.IDLE_OUTLINES))) {
      this.outlines.delete(outline.key);
      outline.release?.();
    }
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

  protected reporting: MorphHost = {
    resolve: (ref, options) => {
      const report = ref.recipes ? this.reportChangeBake : undefined;
      return this.host.resolve(ref, options).then((handle) => {
        if (report && !options?.signal?.aborted) report(ref, handle.artifact);
        return handle;
      });
    },
  };

  get resolver(): MorphHost {
    return this.reporting;
  }

  deliver(params: { key: string; artifact?: MorphArtifact; error?: string }) {
    this.delivered.deliver(params.key, params);
  }

  set askGame(ask: ((key: string) => void) | undefined) {
    this.delivered.ask = ask;
  }

  protected watching?: number;

  watchShown() {
    if (this.watching !== undefined || ![...this.layers].some((layer) => layer.watched)) return;
    this.watching = this.requestFrame(() => {
      this.watching = undefined;
      for (const layer of [...this.layers]) {
        if (!layer.watched) continue;
        if (!layer.span.isConnected) {
          layer.dispose();
          continue;
        }
        if (layer.restyled()) layer.layout();
      }
      this.watchShown();
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
    this.watchShown();
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

  startChange(occurrence: Occurrence, offset?: number) {
    this.restart(occurrence);
    if (offset === undefined || !Number.isFinite(offset)) return;
    offset = Math.max(0, Math.min(1, offset));
    const duration = Number.isFinite(occurrence.timing.duration) ? occurrence.timing.duration : 0;
    const start = lastAtOrBelow(parseMorphEasing(occurrence.timing.easing) ?? ((x: number) => x), offset);
    occurrence.resume = { offset, skip: start.position * duration, from: start.value };
  }

  protected restartAll() {
    for (const occurrence of this.occurrences.values()) this.restart(occurrence);
  }

  protected restart(occurrence: Occurrence) {
    occurrence.cycles += 1;
    occurrence.start = this.time;
    occurrence.resume = undefined;
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
    const elapsed = this.time - occurrence.start;
    const resume = occurrence.resume;
    if (!resume) return occurrence.timeline.at(elapsed);
    const delay = Number.isFinite(occurrence.timing.delay) && occurrence.timing.delay > 0 ? occurrence.timing.delay : 0;
    if (elapsed <= delay) return { phase: "waiting" as const, play: 0 as const, offset: resume.offset };
    const head = occurrence.timeline.at(elapsed + resume.skip);
    if (!("offset" in head) || resume.from === resume.offset) return head;
    const offset = resume.from < 1 ? Math.max(0, Math.min(1, resume.offset + ((head.offset - resume.from) * (1 - resume.offset)) / (1 - resume.from))) : 1;
    return { ...head, offset };
  }

  others(layer: MorphLayer): MorphLayer[] {
    return [...this.layers].filter((other) => other !== layer).reverse();
  }

  mount(
    span: HTMLElement,
    content: MorphImageContent,
    background: string,
    kind: "background" | "mask",
    base: string,
    group: MorphGroup = new MorphGroup(),
    pictures: LayeredPicture[] = [],
    held = false,
  ): MorphLayer {
    const layer = new MorphLayer(this, span, content, background, kind, base, group, pictures);
    if (held) layer.hold();
    this.layers.add(layer);
    (span as HTMLElement & { __sdMorph?: MorphLayer }).__sdMorph = layer;
    layer.start();
    return layer;
  }

  undrawnWithin(root: Element): MorphLayer[] {
    return this.layersWithin(root).filter((layer) => !layer.drawn);
  }

  freezeWithin(root: Element) {
    for (const layer of this.layersWithin(root)) layer.freeze();
  }

  releaseWithin(root: Element) {
    for (const layer of this.layersWithin(root)) layer.dispose();
  }

  adoptPrepared() {
    for (const layer of this.layers) layer.adoptNext();
  }

  prepareLayouts(skip: Set<MorphLayer>): MorphLayer[] {
    const waiting: MorphLayer[] = [];
    for (const layer of this.layers) {
      if (skip.has(layer) || !layer.span.isConnected) continue;
      layer.prepareLayout();
      if (!layer.drawn) waiting.push(layer);
    }
    return waiting;
  }

  layersIn(root: Element): MorphLayer[] {
    return this.layersWithin(root).filter((layer) => layer.span.isConnected);
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

  frameBytes(): number {
    let bytes = 0;
    for (const layer of this.layers) bytes += layer.poseBytes;
    return bytes;
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

  outlineOf(picture: LayeredPicture): OutlineSource | undefined {
    for (const member of this.members) {
      const source = member.outlineSource(picture);
      if (source) return source;
    }
    return undefined;
  }

  outlinesChanged() {
    for (const member of [...this.members]) member.refreshOutlines();
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
  protected alone: { inner: FileState; layer: number }[] = [];

  protected layers: string[];
  protected still: { layer: number; span: number; layers: string[] }[] = [];

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
    if (kind === "background") {
      this.still = (content.still ?? [])
        .filter((still) => still.layer >= 0 && still.span > 0 && still.layer + still.span <= this.layers.length)
        .map((still) => ({ layer: still.layer, span: still.span, layers: cssList(still.image).reverse() }));
    }
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

  protected unbuilt(image: ImageState | undefined): boolean {
    return (
      !!image &&
      (image.slot.state === "idle" ||
        image.slot.state === "pending" ||
        (image.slot.state === "ready" && image.slot.artifact?.status === "live" && !image.view && !image.canvas && !image.poses && !image.broken))
    );
  }

  protected shownLayers(index: number): string[] {
    if (this.loadingStill(index)) return ["none"];
    const still = this.still.find((entry) => index >= entry.layer && index < entry.layer + entry.span);
    if (!still || !this.playback.animating) return [this.layers[index]!];
    const end = still.layer + still.span;
    if (still.layers.length === still.span) {
      const image = this.images.find((entry) => index >= entry.layer && index < entry.layer + entry.span);
      return [this.unbuilt(image) ? still.layers[index - still.layer]! : this.layers[index]!];
    }
    if (!this.images.some((image) => image.layer < end && still.layer < image.layer + image.span && this.unbuilt(image))) return [this.layers[index]!];
    return index === this.stillSlot(still.layer, end) ? still.layers : [];
  }

  protected stillSlot(start: number, end: number): number {
    if (!this.shadowHost) return end - 1;
    return Math.max(-1, ...this.statics.filter(({ layer }) => layer >= start && layer < end).map(({ layer }) => layer));
  }

  protected staticLayer(index: number): string {
    return [...this.shownLayers(index)].reverse().join(", ") || "none";
  }

  showStill() {
    if ((!this.still.length && !this.stills.length) || this.frozen || this.disposed) return;
    if (this.shadowHost) {
      this.layout();
      return;
    }
    const shown = this.layers.flatMap((_, index) => this.shownLayers(index));
    this.span.style.setProperty("background-image", shown.reverse().join(", ") || "none");
  }

  protected styled?: string;

  protected backdrop?: HTMLElement;

  protected styleKey(): string {
    const view = this.span.ownerDocument.defaultView;
    const computed = this.computed();
    const values = computed ? STYLE_KEYS.map((name) => computed.getPropertyValue(name)).join("|") : "";
    return `${values}#${view?.devicePixelRatio ?? 1}#${pictureZoomReach(this.span)}`;
  }

  restyled(): boolean {
    return this.styleKey() !== this.styled;
  }

  get live(): boolean {
    return !this.frozen && !this.disposed && this.images.some((image) => image.view || image.canvas || image.poses || image.inner.some((inner) => inner.view));
  }

  get watched(): boolean {
    return this.drawable || (!this.disposed && this.stills.some((still) => still.canvases));
  }

  get drawable(): boolean {
    return (
      !this.frozen &&
      !this.disposed &&
      this.kind === "background" &&
      (this.images.some((image) => !!this.liveArtifact(image.slot) || image.inner.some((inner) => !!this.liveArtifact(inner.slot))) ||
        this.stills.some((still) => still.canvases))
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
    const continued = this.images.map((image) => this.continuation(image));
    if (this.kind === "mask") this.startOutlines();
    this.playback.track(this);
    this.images.forEach((image, index) => {
      const continuing = continued[index];
      if (continuing) {
        image.turned = continuing.turned;
        image.resume = continuing.offset;
      }
      image.drawn = continuing?.ref ?? image.plays[0]!.play.ref;
      image.slot.set(image.drawn);
      for (const inner of image.inner) inner.slot.set(inner.plays[0]!.play.ref);
    });
    this.startStills();
    this.showStill();
  }

  protected held = false;

  hold() {
    this.held = true;
  }

  release() {
    if (!this.held) return;
    this.held = false;
    for (const image of this.images) {
      if (image.resume === undefined) continue;
      const again = this.continuation(image);
      if (again && again.ref === image.drawn) {
        image.turned = again.turned;
        image.resume = again.offset;
      }
    }
    if (this.active && !this.stale) this.startChanges();
  }

  protected continuation(image: ImageState): { ref: MorphRef; turned: boolean; offset: number } | undefined {
    const [entry, extra] = image.plays;
    if (this.kind !== "background" || extra || image.inner.length || !entry?.occurrence || entry.play.timing.trigger !== "change") return undefined;
    const play = entry.play;
    const pair = changePair(play.ref, play.morph);
    if (!pair) return undefined;
    for (const layer of this.playback.others(this)) {
      if (!layer.active || layer.kind !== this.kind || layer.base !== this.base) continue;
      const old = layer.images.find((candidate) => candidate.layer === image.layer);
      const [was, more] = old?.plays ?? [];
      if (!old || more || old.inner.length || !was?.occurrence) return undefined;
      const pending = !old.view && !old.canvas && !old.poses && !was.started && old.resume !== undefined;
      if (!old.view && !old.canvas && !old.poses && !pending) return undefined;
      const ref = pending || (old.slot.state === "ready" && old.slot.artifact?.status === "live") ? old.drawn : undefined;
      if (!ref || was.play.morph !== play.morph || was.play.owner !== play.owner || ref.image !== play.ref.image) return undefined;
      if (JSON.stringify(was.play.timing) !== JSON.stringify(play.timing)) return undefined;
      if (ref.morphs.length !== 1 || play.ref.morphs.length !== 1) return undefined;
      const drawn = changePair(ref, play.morph);
      if (!drawn || drawn.kept !== pair.kept || !sameOutside(ref.selection, play.ref.selection, pair.groups)) return undefined;
      const turned = drawn.from === pair.to && drawn.to === pair.from;
      if (!turned && !(drawn.from === pair.from && drawn.to === pair.to)) return undefined;
      const head = pending ? { phase: "waiting" as const, offset: old.resume! } : this.playback.playhead(was.occurrence);
      if (head.phase !== "playing" && head.phase !== "waiting") return undefined;
      const shown = old.turned ? 1 - head.offset : head.offset;
      return { ref, turned, offset: turned ? 1 - shown : shown };
    }
    return undefined;
  }

  protected startStills() {
    if (this.kind !== "background") return;
    for (const picture of this.pictures) {
      const end = picture.layer + picture.span;
      if (picture.span < (picture.vector ? 1 : 2) || picture.files.length !== picture.span || picture.layer < 0 || end > this.layers.length) continue;
      const covering = this.images.filter((image) => image.layer < end && picture.layer < image.layer + image.span);
      const under =
        covering.length === 1 && picture.vector && covering[0]!.layer === picture.layer && covering[0]!.span === picture.span
          ? covering[0]
          : undefined;
      if (covering.length > 0 && !under) continue;
      const still: StillPicture = { layer: picture.layer, span: picture.span, picture, rasters: new Map(), ...(under ? { under } : {}) };
      this.stills.push(still);
      const ready = picture.files.map((file) => this.playback.pictureNow(file.src));
      if (ready.every((bitmap) => bitmap)) this.settleStill(still, ready);
      else void this.loadStill(still);
    }
    if (this.stills.some((still) => still.files || still.undrawn)) this.build();
  }

  protected async loadStill(still: StillPicture) {
    still.loading = true;
    const loaded = await Promise.all(still.picture.files.map((file) => this.playback.picture(file.src)));
    still.loading = false;
    if (!this.active) return;
    this.settleStill(still, loaded);
    if (still.files || still.undrawn) this.build();
    this.showStill();
    this.checkDrawn();
  }

  protected settleStill(still: StillPicture, loaded: (PictureBitmap | undefined)[]) {
    const bottom = loaded[0];
    if (still.picture.vector) {
      if (loaded.some((bitmap) => bitmap?.animated || bitmap?.profile)) {
        this.fallBack(still, still.picture);
        return;
      }
      const index = loaded.findIndex(
        (bitmap) =>
          !bitmap || bitmap.unread || bitmap.unsized || bitmap.styled !== undefined || bitmap.width !== bottom?.width || bitmap.height !== bottom?.height,
      );
      const refused = index >= 0 ? loaded[index] : undefined;
      if (index >= 0) {
        const reason: UndrawnReason = !refused || refused.unread ? "unread" : refused.unsized ? "unsized" : refused.styled !== undefined ? "styled" : "undrawn";
        this.refuse(still, { reason, file: still.picture.files[index]!.name, ...(refused?.styled !== undefined ? { declaration: refused.styled } : {}) });
        return;
      }
    } else if (
      !bottom ||
      loaded.some(
        (bitmap) =>
          !bitmap ||
          bitmap.animated ||
          bitmap.profile ||
          bitmap.unread ||
          bitmap.unsized ||
          bitmap.styled !== undefined ||
          bitmap.vector !== undefined ||
          bitmap.width !== bottom.width ||
          bitmap.height !== bottom.height,
      )
    ) {
      this.fallBack(still, still.picture);
      return;
    }
    still.files = { bitmaps: new Map(loaded.map((bitmap, index) => [index, bitmap!])), width: bottom!.width, height: bottom!.height, rasters: new Map() };
    const computed = this.computed();
    if (!this.stillPlans(still, computed)) {
      if (still.picture.vector) this.refuse(still, { reason: "undrawn", file: still.picture.files[0]!.name });
      else this.fallBack(still, still.picture);
    }
  }

  protected fallBack(target: { broken?: boolean; under?: ImageState }, picture: { files: { src: string }[] } | undefined) {
    target.broken = true;
    this.flushMorphReports(target.under);
    if (picture) this.playback.keepWhole?.(picture.files.map((file) => file.src));
  }

  protected refuse(still: StillPicture, undrawn: Undrawn) {
    still.undrawn = undrawn;
    still.late = false;
    this.releaseStill(still);
    if (!still.under) this.report(still, undrawn);
    this.flushMorphReports(still.under);
  }

  protected report(still: StillPicture, undrawn: Undrawn) {
    if (still.reported) return;
    still.reported = true;
    this.playback.reportStill?.({
      image: still.picture.name ?? still.picture.files[0]?.name ?? "",
      file: undrawn.file,
      reason: undrawn.reason,
      ...(undrawn.declaration !== undefined ? { declaration: undrawn.declaration } : {}),
      placeholder: true,
    });
  }

  protected reportMorph(image: ImageState, report: MorphStillParams) {
    if (image.inner.length === 0 && this.stills.some((still) => still.under === image && !still.broken)) {
      (image.pendingReports ??= []).push(report);
      this.flushMorphReports(image);
      return;
    }
    this.playback.reportStill?.(report);
  }

  protected flushMorphReports(image: ImageState | undefined) {
    const pending = image?.pendingReports;
    if (!image || !pending?.length) return;
    const rest = this.stills.find((still) => still.under === image && !still.broken);
    if (rest && !rest.undrawn && (rest.loading || !rest.files || [...rest.rasters.values()].some((raster) => raster.busy || !raster.image))) return;
    image.pendingReports = undefined;
    if (rest?.undrawn) return;
    for (const report of pending) this.playback.reportStill?.(report);
  }

  protected releaseStill(still: StillPicture) {
    for (const raster of still.rasters.values()) raster.release?.();
    still.rasters.clear();
    this.dropNext(still);
  }

  protected dropNext(still: StillPicture) {
    for (const raster of still.next?.rasters.values() ?? []) raster.release?.();
    still.next = undefined;
  }

  adoptNext() {
    if (!this.active || (!this.stills.some((still) => still.next) && !this.images.some((image) => image.canvas?.next))) return;
    this.measureStyle();
    this.relayout();
  }

  prepareLayout() {
    if (!this.active || this.kind !== "background" || this.held) return;
    const shown = this.stills.filter(
      (still) =>
        !!still.canvases?.length &&
        still.picture.vector &&
        !still.undrawn &&
        !still.broken &&
        still.canvases.some((view) => view.painted !== undefined && view.box.isConnected),
    );
    if (shown.length === 0 && !this.images.some((image) => image.canvas?.box.isConnected)) return;
    const computed = this.computed();
    const win = this.span.ownerDocument.defaultView;
    const dpr = win?.devicePixelRatio && win.devicePixelRatio > 0 ? win.devicePixelRatio : 1;
    const style = this.sizing.style;
    this.measureStyle();
    try {
      for (const still of shown) {
        const views = still.canvases!;
        const plans = this.stillPlans(still, computed);
        const area = this.layerBoxes(computed).padding;
        if (!plans || !(area.width > 0 && area.height > 0) || JSON.stringify(this.stillSegments(plans)) !== still.segments) continue;
        const boxSize = `${area.width}x${area.height}`;
        const place = this.stillPlacement(still, plans, area, dpr);
        const wants = new Map<number, { width: number; height: number }>();
        for (const view of views) {
          const paint = this.stillPaint(view, plans, place);
          paint.layers.forEach((index, at) => {
            const want = this.rasterWant(view, paint, at);
            if (want && !wants.has(index)) wants.set(index, want);
          });
        }
        const matches = (rasters: Map<number, StillRaster>) =>
          [...wants].every(([index, want]) => {
            const current = rasters.get(index)?.want;
            return current?.width === want.width && current.height === want.height;
          });
        if (matches(still.rasters)) {
          this.dropNext(still);
          if (still.under?.poses) this.wantPoses(still.under);
          continue;
        }
        if (still.next?.boxSize === boxSize && matches(still.next.rasters)) continue;
        this.dropNext(still);
        const next: NonNullable<StillPicture["next"]> = { boxSize, rasters: new Map() };
        still.next = next;
        for (const [index, want] of wants) {
          const raster: StillRaster = { width: 0, height: 0, want };
          next.rasters.set(index, raster);
          this.rasterizeStill(still, index, raster);
        }
        if (still.under?.poses) this.wantPoses(still.under);
      }
      const area = this.areaOf(computed);
      for (const image of area.width > 0 && area.height > 0 ? this.images : []) {
        const view = image.canvas;
        if (!view || !image.files || image.broken || !view.box.isConnected || !view.runs.some((run) => run.painted !== undefined) || view.files.rasters.size === 0) continue;
        const rect = this.pictureRect(image.files, image.layer, computed, area);
        if (!rect) continue;
        const rectKey = `${rect.x},${rect.y},${rect.width},${rect.height}`;
        const place = this.canvasPlacement(rect, dpr);
        const { w, h } = this.canvasBacking(view, place.width, place.height, dpr);
        if ([...view.files.rasters.values()].every((raster) => raster.want?.width === w && raster.want.height === h)) {
          this.dropCanvasNext(view);
          continue;
        }
        if (view.next && view.next.rect === rectKey && view.next.w === w && view.next.h === h) continue;
        this.dropCanvasNext(view);
        const next: NonNullable<CanvasView["next"]> = { rect: rectKey, w, h, rasters: new Map(), pending: 0 };
        view.next = next;
        for (const file of view.files.rasters.keys()) this.rasterizeCanvasNext(view, file, next);
      }
    } finally {
      this.sizing.style = style;
    }
  }

  protected dropCanvasNext(view: CanvasView) {
    for (const raster of view.next?.rasters.values() ?? []) raster.release();
    view.next = undefined;
  }

  protected rasterizeCanvasNext(view: CanvasView, file: number, next: NonNullable<CanvasView["next"]>) {
    const bitmap = view.files.bitmaps.get(file);
    if (!bitmap?.vector) return;
    next.pending += 1;
    void this.playback
      .rasterizeSvgLayer(bitmap.vector, { width: bitmap.width, height: bitmap.height }, next.w, next.h, this.span.ownerDocument)
      .catch(() => undefined)
      .then((made) => {
        if (view.next !== next || view.files.released || !this.active) {
          made?.release();
          return;
        }
        next.pending -= 1;
        if (made) next.rasters.set(file, { image: made.image, release: made.release, width: next.w, height: next.h });
        else next.refused ??= file;
        if (next.pending === 0) this.layout();
        this.checkDrawn();
      });
  }

  protected canvasPlacement(rect: Rect, dpr: number) {
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
    return { x, y, width, height };
  }

  protected sizing = { zoom: 1, scale: 1, style: 1 };

  protected settleTimer?: number;

  protected settling = false;

  size(reach: { zoom?: number; scale?: number }) {
    const zoom = Math.max(this.sizing.zoom, reach.zoom !== undefined && Number.isFinite(reach.zoom) ? reach.zoom : 1);
    const scale = Math.max(this.sizing.scale, reach.scale !== undefined && Number.isFinite(reach.scale) ? reach.scale : 1);
    if (zoom === this.sizing.zoom && scale === this.sizing.scale) return;
    this.sizing = { ...this.sizing, zoom, scale };
    this.relayout();
  }

  protected relayout() {
    this.settling = true;
    try {
      this.layout();
    } finally {
      this.settling = false;
    }
  }

  protected measureStyle() {
    const span = this.span;
    const rect = typeof span.getBoundingClientRect === "function" ? span.getBoundingClientRect() : undefined;
    const zoom = pictureViewOf(span).zoom;
    if (!rect || !(zoom > 0)) return;
    const across = span.offsetWidth > 0 && rect.width > 0 ? rect.width / span.offsetWidth : 0;
    const down = span.offsetHeight > 0 && rect.height > 0 ? rect.height / span.offsetHeight : 0;
    const ratio = Math.max(across, down) / zoom;
    if (!(ratio > 0) || !Number.isFinite(ratio)) return;
    this.sizing.style = ratio > 1 ? ratio : 1;
  }

  protected snapshot?: CSSStyleDeclaration;

  protected computed(): CSSStyleDeclaration | undefined {
    if (this.held && this.snapshot) return this.snapshot;
    return this.span.ownerDocument.defaultView?.getComputedStyle(this.span);
  }

  protected presized?: { width: number; height: number };

  presize() {
    const computed = this.span.ownerDocument.defaultView?.getComputedStyle(this.span);
    const area = positioningArea(this.span, computed);
    if (!(area.width > 0 && area.height > 0)) return;
    this.presized = area;
    if (computed && this.held) {
      const values = new Map(STYLE_KEYS.map((name) => [name, computed.getPropertyValue(name)]));
      this.snapshot = { getPropertyValue: (name: string) => values.get(name) ?? computed.getPropertyValue(name) } as unknown as CSSStyleDeclaration;
    }
    this.measureStyle();
    this.relayout();
  }

  protected areaOf(computed: CSSStyleDeclaration | undefined) {
    if (this.held && this.presized) return this.presized;
    const area = positioningArea(this.span, computed);
    return area.width > 0 && area.height > 0 ? area : (this.presized ?? area);
  }

  protected reach(): number {
    return Math.max(pictureZoomReach(this.span), this.sizing.zoom) * this.sizing.scale * this.sizing.style;
  }

  protected settleSoon() {
    const view = this.span.ownerDocument.defaultView;
    if (!view || this.disposed) return;
    if (this.settleTimer !== undefined) view.clearTimeout(this.settleTimer);
    this.settleTimer = view.setTimeout(() => {
      this.settleTimer = undefined;
      if (!this.active || !this.span.isConnected) return;
      this.measureStyle();
      this.relayout();
    }, SETTLE_MS);
  }

  protected drawnWaiters: (() => void)[] = [];

  get drawn(): boolean {
    if (!this.active) return true;
    if (this.kind === "mask") return this.outlines.every((entry) => entry.state !== "waiting");
    return this.stills.every((still) => this.stillDrawn(still)) && this.images.every((image) => this.canvasDrawn(image));
  }

  whenDrawn(): Promise<void> {
    if (this.drawn) return Promise.resolve();
    return new Promise((resolve) => this.drawnWaiters.push(resolve));
  }

  protected checkDrawn() {
    if (this.kind === "background") this.group.outlinesChanged();
    for (const still of this.stills) {
      if (still.late && this.stillDrawn(still, true)) {
        still.late = false;
        this.build();
      }
    }
    if (!this.drawnWaiters.length || !this.drawn) return;
    for (const resolve of this.drawnWaiters.splice(0)) resolve();
  }

  overdue() {
    if (!this.active) return;
    if (this.outlines.some((entry) => entry.state === "waiting")) {
      for (const entry of this.outlines) {
        entry.late = true;
        if (entry.state === "waiting") entry.state = "none";
      }
      this.paintMask();
    }
    let changed = false;
    for (const still of this.stills) {
      if (this.stillDrawn(still) || still.canvases?.some((view) => view.painted !== undefined)) continue;
      still.late = true;
      changed = true;
      this.report(still, {
        reason: "late",
        file: still.picture.files.find((_, index) => still.files?.bitmaps.get(index)?.vector)?.name ?? still.picture.files[0]!.name,
      });
    }
    for (const image of this.images) {
      if (!image.picture || image.reported || this.canvasDrawn(image)) continue;
      if (this.stills.some((still) => still.under === image)) continue;
      image.reported = true;
      this.playback.reportStill?.({ image: image.plays[0]!.play.ref.image, file: image.picture.files[0]?.name ?? "", reason: "late" });
    }
    if (changed) this.build();
    for (const resolve of this.drawnWaiters.splice(0)) resolve();
  }

  protected stillDrawn(still: StillPicture, ignoreLate = false): boolean {
    if (still.broken || still.undrawn || this.arealess || (still.under && this.uncomposited(still.under) && still.under.inner.length > 0)) return true;
    if (still.late && !ignoreLate) return true;
    if (still.loading || !still.files) return !still.loading;
    const canvases = still.canvases;
    if (!canvases) return false;
    if (canvases.some((view) => view.painted === undefined)) return false;
    const ready = (raster: StillRaster) =>
      !raster.busy && !!raster.image && (!raster.want || (raster.width === raster.want.width && raster.height === raster.want.height));
    if (![...still.rasters.values()].every(ready) || (still.next && !still.next.refused && ![...still.next.rasters.values()].every(ready))) return false;
    return !this.posing(still) || this.posesDrawn(still.under!);
  }

  protected canvasDrawn(image: ImageState): boolean {
    if (!image.picture) return true;
    const state = image.slot.state;
    if (state === "idle" || state === "pending") return false;
    if (this.uncomposited(image) || this.arealess) return true;
    if (image.loading && !image.files && !image.broken) return false;
    const view = image.canvas;
    if (!view) return !this.stale;
    if (view.runs.some((run) => run.painted === undefined)) return false;
    if (view.next && view.next.refused === undefined && view.next.pending > 0) return false;
    return [...view.files.rasters.values()].every((raster) => !raster.busy);
  }

  renew(epoch: number) {
    if (this.content.epoch === epoch || !this.active) return;
    this.content = { ...this.content, epoch };
    for (const image of this.images) {
      const keyed = [
        ...image.plays.map((entry) => ({ entry, at: image.layer as number | string })),
        ...image.inner.flatMap((inner) => inner.plays.map((entry) => ({ entry, at: `${image.layer}/${inner.file}` }))),
      ];
      for (const { entry, at } of keyed) {
        if (!entry.occurrence) continue;
        this.playback.letGo(entry.occurrence);
        entry.occurrence = this.playback.occurrenceFor(this.occurrenceKey(entry.play, at), entry.play.timing, entry.play.owner);
      }
    }
    this.render();
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
    releaseFiles(image.files);
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
      this.fallBack(image, picture);
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
      const reason = bitmap?.animated
        ? ("animated" as const)
        : bitmap?.profile
          ? ("profile" as const)
          : bitmap?.unread
            ? ("unread" as const)
            : bitmap?.unsized
              ? ("unsized" as const)
              : bitmap?.styled !== undefined
                ? ("styled" as const)
                : undefined;
      return reason ? [{ index, reason }] : [];
    });
    for (const { index, reason } of unfaithful) {
      const declaration = reason === "styled" ? bitmaps.get(index)?.styled : undefined;
      this.reportMorph(image, { image: image.plays[0]!.play.ref.image, file: files[index]!.name, reason, ...(declaration !== undefined ? { declaration } : {}) });
    }
    const declared = svgIntrinsicSize(artifact);
    const width = declared.width || bottom?.width;
    const height = declared.height || bottom?.height;
    if (
      !bottom ||
      !width ||
      !height ||
      unfaithful.length > 0 ||
      bitmaps.size !== indices.length ||
      [...bitmaps.values()].some((bitmap) => bitmap.width !== width || bitmap.height !== height)
    ) {
      this.fallBack(image, picture);
      return;
    }
    const pixels = width * height;
    const shrink = pixels > MAX_CANVAS_PIXELS ? Math.sqrt(MAX_CANVAS_PIXELS / pixels) : 1;
    const first = { width: Math.max(1, Math.round(width * shrink)), height: Math.max(1, Math.round(height * shrink)) };
    const doc = this.span.ownerDocument;
    const made = await Promise.all(
      [...bitmaps]
        .filter(([, bitmap]) => bitmap.vector)
        .map(async ([index, bitmap]) => {
          const raster = await this.playback
            .rasterizeSvgLayer(bitmap.vector!, { width: bitmap.width, height: bitmap.height }, first.width, first.height, doc)
            .catch(() => undefined);
          return [index, raster] as const;
        }),
    );
    const current = image.loading?.artifact === artifact;
    const refused = made.filter(([, raster]) => !raster);
    if (!current || refused.length > 0) {
      for (const [, raster] of made) raster?.release();
      if (!current) return;
      for (const [index] of refused) {
        this.reportMorph(image, { image: image.plays[0]!.play.ref.image, file: files[index]!.name, reason: "undrawn" });
      }
      image.broken = true;
      return;
    }
    const rasters = new Map<number, FileRaster>();
    for (const [index, raster] of made) rasters.set(index, { image: raster!.image, release: raster!.release, ...first });
    image.files = { model, bitmaps, width, height, rasters };
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
    if (!this.held) this.startChanges();
    this.build();
    this.showStill();
    this.playback.track(this);
  }

  protected startChanges() {
    for (const image of this.images) {
      if (image.slot.state !== "ready" || image.slot.artifact?.status !== "live" || (image.picture && (!image.files || image.broken))) continue;
      for (const entry of image.plays) {
        if (entry.started || !entry.occurrence || entry.play.timing.trigger !== "change") continue;
        entry.started = true;
        this.playback.startChange(entry.occurrence, image.resume);
      }
    }
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

  protected rested = new Map<number, string>();

  protected outlines: MaskOutline[] = [];

  protected applyMask() {
    const urls = this.maskUrls();
    if (!urls.size) return;
    this.rested = urls;
    this.paintMask();
  }

  protected paintMask() {
    if (!this.rested.size && this.outlines.length === 0) return;
    const layers = [...this.layers];
    for (const [layer, url] of this.rested) layers[layer] = `url("${url}")`;
    const sized: { cssIndex: number; natural: { width: number; height: number } }[] = [];
    for (const entry of this.outlines) {
      if (entry.state === "css") continue;
      const { layer, span } = entry.picture;
      for (let k = 0; k < span; k++) layers[layer + k] = "none";
      layers[layer] = entry.shown?.url ? `url("${entry.shown.url}")` : HIDDEN_MASK;
      if (entry.shown?.url && entry.natural) sized.push({ cssIndex: this.layers.length - 1 - layer, natural: entry.natural });
    }
    const value = [...layers].reverse().join(", ");
    if (this.span.style.getPropertyValue("mask-image") === value) return;
    this.span.style.setProperty("mask-image", value);
    this.keepIntrinsicSize(sized);
  }

  protected keepIntrinsicSize(sized: { cssIndex: number; natural: { width: number; height: number } }[]) {
    if (sized.length === 0) return;
    const computed = this.span.ownerDocument.defaultView?.getComputedStyle(this.span);
    const list = computed?.getPropertyValue("mask-size") || computed?.getPropertyValue("-webkit-mask-size") || "";
    const count = this.layers.length;
    const sizes = Array.from({ length: count }, (_, cssIndex) => layerValue(list, cssIndex) || "auto");
    let changed = false;
    for (const { cssIndex, natural } of sized) {
      const parts = sizes[cssIndex]!.split(/\s+/);
      if (!parts.every((part) => part === "auto")) continue;
      sizes[cssIndex] = `${natural.width}px ${natural.height}px`;
      changed = true;
    }
    if (changed) this.span.style.setProperty("mask-size", sizes.join(", "));
  }

  protected startOutlines() {
    for (const picture of this.pictures) {
      if (picture.span < 1 || picture.files.length !== picture.span || picture.layer < 0 || picture.layer + picture.span > this.layers.length) continue;
      this.outlines.push({ picture, state: "waiting" });
    }
    this.refreshOutlines();
  }

  outlineSource(picture: LayeredPicture): OutlineSource | undefined {
    if (this.kind !== "background" || !this.active) return undefined;
    const still = this.stills.find(
      (entry) =>
        entry.layer === picture.layer &&
        entry.span === picture.span &&
        entry.picture.files.length === picture.files.length &&
        entry.picture.files.every((file, index) => file.src === picture.files[index]!.src),
    );
    if (!still) return this.morphOutline(picture);
    if (still.broken || this.arealess || (still.under && this.uncomposited(still.under) && still.under.inner.length > 0)) return { state: "css" };
    if (still.undrawn) return { state: "none" };
    const files = still.files;
    const unready = { state: still.late ? "none" : "waiting" } as const;
    if (still.loading || !files) return unready;
    const layers: OutlineLayer[] = [...files.bitmaps.keys()]
      .sort((a, b) => a - b)
      .map((index) => ({ bitmap: files.bitmaps.get(index)!, raster: still.rasters.get(index) }));
    return this.readyOutline(picture, files, layers) ?? unready;
  }

  protected morphOutline(picture: LayeredPicture): OutlineSource | undefined {
    const image = this.images.find((entry) => entry.picture && entry.layer === picture.layer && entry.span === picture.span);
    if (!image?.picture) return undefined;
    if (this.uncomposited(image) || this.arealess) return { state: "css" };
    const files = image.files;
    if (!files) return { state: image.reported ? "none" : "waiting" };
    const layers: OutlineLayer[] = [];
    for (const file of picture.files) {
      const index = image.picture.files.findIndex((entry) => entry.src === file.src);
      const bitmap = (index >= 0 ? files.bitmaps.get(index) : undefined) ?? this.playback.pictureNow(file.src);
      if (!bitmap || (bitmap.vector && !files.rasters.get(index))) return { state: "css" };
      layers.push({ bitmap, ...(bitmap.vector ? { raster: files.rasters.get(index) } : {}) });
    }
    return this.readyOutline(picture, files, layers) ?? { state: "css" };
  }

  protected readyOutline(
    picture: LayeredPicture,
    files: PictureFiles,
    layers: OutlineLayer[],
  ): OutlineSource | undefined {
    const sources: PictureBitmap[] = [];
    let width = 0;
    let height = 0;
    for (const { bitmap, raster } of layers) {
      if (!bitmap.vector) {
        sources.push(bitmap);
        continue;
      }
      if (!raster?.image) return undefined;
      sources.push({ ...bitmap, image: raster.image, box: undefined });
      width = Math.max(width, raster.width);
      height = Math.max(height, raster.height);
    }
    if (!(width > 0 && height > 0)) {
      const shrink = files.width * files.height > MAX_CANVAS_PIXELS ? Math.sqrt(MAX_CANVAS_PIXELS / (files.width * files.height)) : 1;
      width = Math.max(1, Math.round(files.width * shrink));
      height = Math.max(1, Math.round(files.height * shrink));
    }
    return {
      state: "ready",
      key: `${picture.files.map((file) => file.src).join("\n")}|${width}x${height}`,
      width,
      height,
      natural: { width: files.width, height: files.height },
      draw: (context) => {
        for (const source of sources) drawPicture(context, source, 0, 0, width, height);
      },
    };
  }

  refreshOutlines() {
    if (this.kind !== "mask" || !this.active || this.outlines.length === 0) return;
    for (const entry of this.outlines) {
      const source = this.group.outlineOf(entry.picture);
      const held = entry.shown ?? entry.pending;
      if (!source) {
        if (!held && entry.state === "waiting") entry.state = "css";
        continue;
      }
      if (source.state === "ready") {
        entry.natural = source.natural;
        if (held && (held.key === source.key || (held.width >= source.width && held.height >= source.height))) continue;
        if (entry.pending) this.playback.releaseOutline(entry.pending);
        const outline = this.playback.outline(source);
        entry.pending = outline;
        if (!entry.shown) entry.state = entry.late ? "none" : "waiting";
        void outline.ready.then((url) => this.landOutline(entry, outline, url));
        continue;
      }
      if (source.state === "waiting") {
        if (!held) entry.state = entry.late ? "none" : "waiting";
        continue;
      }
      this.dropOutline(entry);
      entry.state = source.state;
    }
    this.paintMask();
    this.checkDrawn();
  }

  protected landOutline(entry: MaskOutline, outline: Outline, url: string | undefined) {
    if (entry.pending !== outline) return;
    entry.pending = undefined;
    if (!this.active || !url) {
      this.playback.releaseOutline(outline);
      if (this.active && !entry.shown) entry.state = "css";
    } else {
      if (entry.shown) this.playback.releaseOutline(entry.shown);
      entry.shown = outline;
      entry.state = "shown";
    }
    if (!this.active) return;
    this.paintMask();
    this.checkDrawn();
  }

  protected dropOutline(entry: MaskOutline) {
    if (entry.pending) this.playback.releaseOutline(entry.pending);
    if (entry.shown) this.playback.releaseOutline(entry.shown);
    entry.pending = undefined;
    entry.shown = undefined;
  }

  protected build() {
    this.releaseMotions();
    this.alone = [];
    for (const image of this.images) {
      if (image.canvas) this.dropCanvasNext(image.canvas);
      image.view = undefined;
      image.canvas = undefined;
      for (const inner of image.inner) inner.view = undefined;
      if (image.poses && (image.poses.artifact !== this.liveArtifact(image.slot) || !this.posing(image.poses.still))) this.releasePoses(image);
    }
    const ready = this.images.filter(
      (image) =>
        image.slot.state === "ready" &&
        image.slot.artifact?.status === "live" &&
        (!image.picture || (!!image.files && !image.broken)),
    );
    const stills = this.stills.filter(
      (still) =>
        (still.files || still.undrawn || still.late) &&
        !still.broken &&
        (!still.under ||
          (this.uncomposited(still.under) ? still.under.inner.length === 0 : this.posing(still))),
    );
    const fallen = this.images.filter((image) => image.picture && this.uncomposited(image));
    for (const image of fallen) this.playback.keepWhole?.(image.picture!.files.map((file) => file.src));
    const alone = (i: number, picture: ImageState | undefined) => {
      const inner = picture?.inner.find((entry) => picture.picture!.files[entry.file]?.layer === i);
      return inner && this.liveArtifact(inner.slot) ? inner : undefined;
    };
    if (
      !ready.length &&
      !stills.length &&
      !this.stills.some((rest) => rest.under && rest.files && !rest.broken && !rest.undrawn && !this.uncomposited(rest.under)) &&
      !fallen.some((image) => image.inner.some((inner) => this.liveArtifact(inner.slot) && image.picture!.files[inner.file]?.layer !== undefined))
    ) {
      this.unbuild();
      return;
    }
    const doc = this.span.ownerDocument;
    if (!this.shadowHost) {
      const host = doc.createElement("span");
      host.className = "morph";
      host.setAttribute("style", HOST_STYLE);
      host.attachShadow({ mode: "open" });
      this.span.insertBefore(host, this.span.firstChild);
      this.shadowHost = host;
    }
    const root = this.shadowHost.shadowRoot!;
    root.replaceChildren();
    this.statics = [];
    const computed = this.computed();
    const count = this.layers.length;
    const still = (i: number) => {
      const div = doc.createElement("div");
      this.statics.push({ div, layer: i });
      root.appendChild(div);
    };
    const stillOrAlone = (i: number, picture: ImageState | undefined) => {
      const inner = alone(i, picture);
      if (inner) this.alone.push({ inner, layer: i });
      const artifact = inner && !inner.broken ? this.liveArtifact(inner.slot) : undefined;
      const placed = !!artifact && !!this.placement(artifact, computed, count - 1 - i);
      const view = placed ? this.liveView(artifact!, doc) : undefined;
      if (inner && placed && !view) inner.broken = true;
      if (inner && view) {
        inner.view = view;
        root.appendChild(view.box);
        return;
      }
      still(i);
    };
    for (let i = 0; i < count; i++) {
      const state = ready.find((image) => image.layer === i);
      if (state?.picture) {
        const span = Math.min(state.span, count - i);
        const files = state.files!;
        const canvas = this.pictureRect(files, i, computed) ? this.canvasView(state, doc) : undefined;
        if (canvas) {
          state.canvas = canvas;
          root.appendChild(canvas.box);
        } else {
          if (this.pictureRect(files, i, computed)) this.fallBack(state, state.picture);
          for (let k = 0; k < span; k++) stillOrAlone(i + k, state);
        }
        i += span - 1;
        continue;
      }
      const rest = state ? this.posingStill(state) : undefined;
      const picture = state && !rest ? undefined : stills.find((entry) => entry.layer === i);
      if (picture) {
        const span = Math.min(picture.span, count - i);
        if (picture.undrawn || picture.late) {
          if (picture.undrawn) this.report(picture, picture.undrawn);
          if (picture.late && picture.files) this.stillCanvases(picture, computed, doc);
          if (this.playback.placeholders) root.appendChild(this.placeholder(picture, doc));
        } else if (this.stillCanvases(picture, computed, doc)) {
          for (const view of picture.canvases!) root.appendChild(view.box);
        } else if (picture.picture.vector) {
          this.refuse(picture, { reason: "undrawn", file: picture.picture.files[0]!.name });
          if (this.playback.placeholders) root.appendChild(this.placeholder(picture, doc));
        } else {
          this.fallBack(picture, picture.picture);
          for (let k = 0; k < span; k++) still(i + k);
        }
        if (state && picture === rest) this.preparePoses(state, rest);
        i += span - 1;
        continue;
      }
      if (rest) {
        still(i);
        continue;
      }
      const covering = fallen.find((image) => i >= image.layer && i < image.layer + image.span);
      if (covering) {
        stillOrAlone(i, covering);
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
    for (const rest of this.stills) {
      if (rest.under && rest.files && !rest.broken && !rest.undrawn && !this.uncomposited(rest.under) && !rest.canvases?.some((view) => view.box.isConnected))
        this.stillCanvases(rest, computed, doc);
    }
    this.span.style.setProperty("background-image", this.layers.map(() => "none").join(", "));
    this.layout();
    this.render();
    this.playback.watchShown();
    this.checkDrawn();
  }

  protected stillCanvases(picture: StillPicture, computed: CSSStyleDeclaration | undefined, doc: Document): boolean {
    const files = picture.files;
    if (!files) return false;
    const plans = this.stillPlans(picture, computed);
    const segments = plans ? this.stillSegments(plans) : [{ blend: "normal", layers: [...files.bitmaps.keys()] }];
    const signature = JSON.stringify(segments);
    if (!picture.canvases || picture.segments !== signature) {
      const views = segments.map((segment) => this.stillCanvas(files, segment, doc));
      picture.canvases = views.every((view) => view) ? (views as StillCanvas[]) : undefined;
      picture.segments = signature;
    }
    if (picture.canvases) this.sizeObjects(picture);
    return !!picture.canvases;
  }

  protected placeholder(picture: StillPicture, doc: Document): HTMLElement {
    const undrawn = picture.undrawn ?? { reason: "late" as const, file: picture.picture.files[0]?.name ?? "" };
    const box = doc.createElement("div");
    box.setAttribute("data-undrawn", undrawn.reason);
    box.setAttribute(
      "style",
      "position:absolute;inset:0;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:8px;overflow:hidden;border:2px dashed rgba(255,255,255,0.75);outline:1px solid rgba(0,0,0,0.6);outline-offset:-3px;background:rgba(40,40,48,0.55);color:#fff;font:12px/1.3 system-ui,sans-serif;text-align:center;text-shadow:0 1px 2px #000",
    );
    const name = doc.createElement("div");
    name.setAttribute("style", "font-weight:600;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap");
    name.textContent = picture.picture.name ?? undrawn.file;
    const why = doc.createElement("div");
    why.setAttribute("style", "max-width:100%;opacity:0.9");
    why.textContent =
      undrawn.reason === "styled" && undrawn.declaration
        ? `Its SVG root is styled with ${undrawn.declaration}, which the player cannot draw.`
        : UNDRAWN_LINES[undrawn.reason];
    box.append(name, why);
    return box;
  }

  protected layerBoxes(computed: CSSStyleDeclaration | undefined): LayerBoxes {
    const area = this.areaOf(computed);
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

  protected stillSegments(plans: LayerPaint[]): StillSegment[] {
    const segments: StillSegment[] = [];
    plans.forEach((plan, index) => {
      const last = segments.at(-1);
      if (plan.blend === "normal" && last?.blend === "normal") last.layers.push(index);
      else segments.push({ blend: plan.blend, layers: [index] });
    });
    return segments;
  }

  protected cornerRadii(computed: CSSStyleDeclaration | undefined, boxes: LayerBoxes, box: Rect): number[] {
    const border = boxes.border;
    const radii = ["top-left", "top-right", "bottom-right", "bottom-left"].flatMap((corner) => {
      const [x = "0", y = x] = splitTopLevel((computed?.getPropertyValue(`border-${corner}-radius`) ?? "").trim());
      return [cssLength(x, border.width) ?? 0, cssLength(y, border.height) ?? 0];
    });
    const sums = [
      [border.width, radii[0]! + radii[2]!],
      [border.width, radii[6]! + radii[4]!],
      [border.height, radii[1]! + radii[7]!],
      [border.height, radii[3]! + radii[5]!],
    ];
    const reduce = Math.min(1, ...sums.map(([side, sum]) => (sum! > 0 ? side! / sum! : 1)));
    const left = box.x - border.x;
    const top = box.y - border.y;
    const right = border.x + border.width - (box.x + box.width);
    const bottom = border.y + border.height - (box.y + box.height);
    const insets = [left, top, right, top, right, bottom, left, bottom];
    return radii.map((radius, index) => Math.max(0, radius * reduce - insets[index]!));
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
          clip: value("background-clip", k) === "text" ? "border-box" : value("background-clip", k),
          blend: value("background-blend-mode", k),
        },
        boxes,
        { width: files.width, height: files.height },
      );
      if (!plan) return undefined;
      plans.push({ ...plan, radii: this.cornerRadii(computed, boxes, plan.clip) });
    }
    return plans;
  }

  protected placeStill(still: StillPicture, computed: CSSStyleDeclaration | undefined) {
    const views = still.canvases;
    const files = still.files;
    const plans = this.stillPlans(still, computed);
    if (!views || !files || !plans) return;
    if (JSON.stringify(this.stillSegments(plans)) !== still.segments) {
      this.build();
      return;
    }
    const area = this.layerBoxes(computed).padding;
    if (!(area.width > 0 && area.height > 0)) return;
    const win = this.span.ownerDocument.defaultView;
    const dpr = win?.devicePixelRatio && win.devicePixelRatio > 0 ? win.devicePixelRatio : 1;
    const boxSize = `${area.width}x${area.height}`;
    const painted = views.some((view) => view.painted !== undefined);
    const resized = views.some((view) => view.boxSize !== boxSize);
    const next = still.next;
    const adopt = resized && next?.boxSize === boxSize && (!!next.refused || [...next.rasters.values()].every((raster) => !raster.busy && !!raster.image));
    if (painted && !this.settling && !adopt) {
      for (const view of views) {
        const last = view.still;
        if (!last || !resized) continue;
        const blended = view.segment.blend !== "normal" ? `;mix-blend-mode:${view.segment.blend}` : "";
        const style = `position:absolute;left:${last.left}px;top:${last.top}px;width:${area.width}px;height:${area.height}px${blended}`;
        if (view.box.getAttribute("style") !== style) view.box.setAttribute("style", style);
      }
      const grows = views.some((view) => {
        const last = view.still;
        if (!last) return false;
        const wanted = this.stillBacking(still, plans, { width: last.backing.w / last.unitX, height: last.backing.h / last.unitY }, dpr);
        return wanted.w > last.backing.w || wanted.h > last.backing.h;
      });
      if (resized || grows) this.settleSoon();
      if (!resized) {
        for (const view of views) {
          if (view.still) {
            view.still = { ...view.still, plans: view.segment.layers.map((index) => plans[index]!) };
            this.wantRasters(still, view, view.still);
            this.paintStill(view, view.still, still);
          }
        }
      }
      return;
    }
    if (next) {
      if (next.boxSize === boxSize && next.refused) {
        const undrawn = next.refused;
        this.dropNext(still);
        this.refuse(still, undrawn);
        this.build();
        return;
      }
      if (next.boxSize === boxSize) {
        for (const [index, raster] of next.rasters) {
          const old = still.rasters.get(index);
          if (old !== raster) old?.release?.();
          still.rasters.set(index, raster);
        }
        still.next = undefined;
      }
    }
    if (!painted || adopt) this.measureStyle();
    const place = this.stillPlacement(still, plans, area, dpr);
    for (const view of views) {
      const blended = view.segment.blend !== "normal" ? `;mix-blend-mode:${view.segment.blend}` : "";
      const style = `position:absolute;left:${place.left}px;top:${place.top}px;width:${place.width}px;height:${place.height}px${blended}`;
      if (view.box.getAttribute("style") !== style) view.box.setAttribute("style", style);
      view.boxSize = boxSize;
      view.still = this.stillPaint(view, plans, place);
      this.wantRasters(still, view, view.still);
    }
    for (const view of views) this.paintStill(view, view.still!, still);
  }

  protected stillPlacement(still: StillPicture, plans: LayerPaint[], area: { width: number; height: number }, dpr: number) {
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
    const { w, h } = this.stillBacking(still, plans, { width, height }, dpr);
    return { left, top, width, height, w, h };
  }

  protected stillPaint(view: StillCanvas, plans: LayerPaint[], place: ReturnType<MorphLayer["stillPlacement"]>): StillPaint {
    const { left, top, width, height, w, h } = place;
    return {
      plans: view.segment.layers.map((index) => plans[index]!),
      layers: view.segment.layers,
      left,
      top,
      unitX: w / width,
      unitY: h / height,
      backing: { w, h },
    };
  }

  protected stillBacking(still: StillPicture, plans: LayerPaint[], box: { width: number; height: number }, dpr: number) {
    const files = still.files!;
    const tiles = plans.flatMap((plan) => [...plan.tiles.slice(0, 1), ...(plan.pattern ? [plan.pattern.tile] : [])]);
    const resolution = Math.max(
      0,
      ...tiles.map((tile) => Math.max(tile.width > 0 ? files.width / tile.width : 0, tile.height > 0 ? files.height / tile.height : 0)),
    );
    const reach = this.reach();
    const scale = Math.max(1, still.picture.vector ? reach : Math.min(reach, resolution / dpr));
    const pixels = Math.max(1, box.width * dpr * scale) * Math.max(1, box.height * dpr * scale);
    const shrink = pixels > MAX_CANVAS_PIXELS ? Math.sqrt(MAX_CANVAS_PIXELS / pixels) : 1;
    return { w: Math.max(1, Math.round(box.width * dpr * scale * shrink)), h: Math.max(1, Math.round(box.height * dpr * scale * shrink)) };
  }

  protected rasterWant(view: StillCanvas, paint: StillPaint, at: number): { width: number; height: number } | undefined {
    const bitmap = view.files.bitmaps.get(paint.layers[at]!);
    const plan = paint.plans[at];
    if (!bitmap?.vector || !plan) return undefined;
    const tile = plan.pattern?.tile ?? plan.tiles[0];
    if (!tile) return undefined;
    let width = Math.max(1, Math.round(tile.width * paint.unitX));
    let height = Math.max(1, Math.round(tile.height * paint.unitY));
    if (width * height > MAX_CANVAS_PIXELS) {
      const shrink = Math.sqrt(MAX_CANVAS_PIXELS / (width * height));
      width = Math.max(1, Math.floor(width * shrink));
      height = Math.max(1, Math.floor(height * shrink));
    }
    return { width, height };
  }

  protected wantRasters(still: StillPicture, view: StillCanvas, paint: StillPaint) {
    paint.layers.forEach((index, at) => {
      const want = this.rasterWant(view, paint, at);
      if (!want) return;
      let raster = still.rasters.get(index);
      if (!raster) {
        raster = { width: 0, height: 0 };
        still.rasters.set(index, raster);
      }
      raster.want = want;
      this.rasterizeStill(still, index, raster);
    });
    if (still.under?.poses) this.wantPoses(still.under);
  }

  protected rasterizeStill(still: StillPicture, index: number, raster: StillRaster) {
    const want = raster.want;
    const bitmap = still.files?.bitmaps.get(index);
    if (raster.busy || !want || !bitmap?.vector || still.undrawn) return;
    if (raster.image && raster.width === want.width && raster.height === want.height) return;
    raster.busy = true;
    void this.playback
      .rasterizeSvgLayer(bitmap.vector, { width: bitmap.width, height: bitmap.height }, want.width, want.height, this.span.ownerDocument)
      .catch(() => undefined)
      .then((made) => {
        raster.busy = false;
        const shown = still.rasters.get(index) === raster;
        if (!this.active || (!shown && still.next?.rasters.get(index) !== raster)) {
          made?.release();
          return;
        }
        if (shown) this.landRaster(still, index, raster, want, made);
        else this.landNext(still, index, raster, want, made);
      });
  }

  protected landNext(still: StillPicture, index: number, raster: StillRaster, want: { width: number; height: number }, made: SvgLayerRaster | undefined) {
    if (!made) {
      still.next!.refused ??= { reason: "undrawn", file: still.picture.files[index]!.name };
      this.layout();
      this.checkDrawn();
      return;
    }
    raster.release?.();
    raster.image = made.image;
    raster.release = made.release;
    raster.width = want.width;
    raster.height = want.height;
    if (raster.want && (raster.want.width !== want.width || raster.want.height !== want.height)) {
      this.rasterizeStill(still, index, raster);
      return;
    }
    if (still.next!.refused || [...still.next!.rasters.values()].every((entry) => !entry.busy && !!entry.image)) this.layout();
    if (still.under?.poses) this.wantPoses(still.under);
    this.checkDrawn();
  }

  protected landRaster(still: StillPicture, index: number, raster: StillRaster, want: { width: number; height: number }, made: SvgLayerRaster | undefined) {
    if (!made) {
      this.refuse(still, { reason: "undrawn", file: still.picture.files[index]!.name });
      this.build();
      this.checkDrawn();
      return;
    }
    raster.release?.();
    raster.image = made.image;
    raster.release = made.release;
    raster.width = want.width;
    raster.height = want.height;
    if (raster.want && (raster.want.width !== want.width || raster.want.height !== want.height)) {
      this.rasterizeStill(still, index, raster);
      return;
    }
    for (const view of still.canvases ?? []) {
      if (view.still && view.segment.layers.includes(index)) this.paintStill(view, view.still, still);
    }
    if (still.under?.poses) this.wantPoses(still.under);
    this.flushMorphReports(still.under);
    this.checkDrawn();
  }

  protected paintStill(view: StillCanvas, still: StillPaint, picture: StillPicture) {
    const { canvas, context } = view;
    const smooth = view.smooth !== false;
    const sources = new Map<number, PictureBitmap>();
    const sizes = new Map<number, { width: number; height: number }>();
    const drawn: string[] = [];
    for (const index of still.layers) {
      const bitmap = view.files.bitmaps.get(index);
      if (!bitmap?.vector) continue;
      const raster = picture.rasters.get(index);
      const want = raster?.want;
      if (!raster?.image || !want || raster.width !== want.width || raster.height !== want.height) return;
      const pose = this.poseRaster(picture, index);
      sources.set(index, { ...bitmap, image: pose?.image ?? raster.image, box: undefined });
      sizes.set(index, pose ?? raster);
      drawn.push(`${index}:${raster.width}x${raster.height}${pose ? `:${pose.id}@${pose.width}x${pose.height}` : ""}`);
    }
    if (canvas.width !== still.backing.w || canvas.height !== still.backing.h) {
      canvas.width = still.backing.w;
      canvas.height = still.backing.h;
    }
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
      clip: device(plan.clip),
      radii: (plan.radii ?? []).map((radius, index) => radius * (index % 2 === 0 ? still.unitX : still.unitY)),
      tiles: plan.tiles.map(device),
      pattern: plan.pattern
        ? {
            repeatX: plan.pattern.repeatX,
            repeatY: plan.pattern.repeatY,
            tile: {
              x: (plan.pattern.tile.x - still.left) * still.unitX,
              y: (plan.pattern.tile.y - still.top) * still.unitY,
              width: plan.pattern.tile.width * still.unitX,
              height: plan.pattern.tile.height * still.unitY,
            },
            stepX: plan.pattern.stepX * still.unitX,
            stepY: plan.pattern.stepY * still.unitY,
          }
        : undefined,
    }));
    const key = `${canvas.width}x${canvas.height}|${smooth}|${still.layers.join(",")}|${drawn.join(",")}|${JSON.stringify(plans)}`;
    if (view.painted === key) return;
    view.painted = key;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalAlpha = 1;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = smooth;
    const covers = (r: Rect) => r.x <= 0 && r.y <= 0 && r.x + r.width >= canvas.width && r.y + r.height >= canvas.height;
    const doc = this.span.ownerDocument;
    const Matrix = doc.defaultView?.DOMMatrix;
    plans.forEach((plan, index) => {
      const layer = still.layers[index]!;
      const bitmap = sources.get(layer) ?? view.files.bitmaps.get(layer);
      if (!bitmap) return;
      const rounded = plan.radii.some((radius) => radius > 0) && !!context.roundRect;
      const clipped = (rounded || !covers(plan.clip)) && !!(context.save && context.beginPath && context.rect && context.clip && context.restore);
      if (clipped) {
        context.save!();
        context.beginPath!();
        if (rounded) {
          const r = plan.radii;
          context.roundRect!(plan.clip.x, plan.clip.y, plan.clip.width, plan.clip.height, [
            { x: r[0]!, y: r[1]! },
            { x: r[2]!, y: r[3]! },
            { x: r[4]!, y: r[5]! },
            { x: r[6]!, y: r[7]! },
          ]);
        } else {
          context.rect!(plan.clip.x, plan.clip.y, plan.clip.width, plan.clip.height);
        }
        context.clip!();
      }
      const pattern = plan.pattern;
      const sample = pattern?.tile ?? plan.tiles[0];
      if ("imageSmoothingQuality" in context) context.imageSmoothingQuality = sample && sample.width < bitmap.width ? "high" : "low";
      let filled = false;
      if (pattern && context.createPattern && context.fillRect && Matrix) {
        const periodX = pattern.repeatX ? pattern.stepX : pattern.tile.width;
        const periodY = pattern.repeatY ? pattern.stepY : pattern.tile.height;
        const gapped = Math.abs(periodX - pattern.tile.width) > 0.01 || Math.abs(periodY - pattern.tile.height) > 0.01;
        const raster = sources.has(layer) ? sizes.get(layer) : undefined;
        let source: CanvasImageSource | undefined = bitmap.image;
        let sourceWidth = raster?.width ?? bitmap.width;
        let sourceHeight = raster?.height ?? bitmap.height;
        if (gapped || bitmap.box) {
          const cell = doc.createElement("canvas");
          cell.width = Math.max(1, Math.round(periodX));
          cell.height = Math.max(1, Math.round(periodY));
          const cellContext = this.playback.pictureCanvas(cell);
          if (cellContext) {
            cellContext.imageSmoothingEnabled = smooth;
            drawPicture(cellContext, bitmap, 0, 0, (pattern.tile.width * cell.width) / periodX, (pattern.tile.height * cell.height) / periodY);
            source = cell;
            sourceWidth = cell.width;
            sourceHeight = cell.height;
          } else {
            source = undefined;
          }
        }
        const repetition = pattern.repeatX && pattern.repeatY ? "repeat" : pattern.repeatX ? "repeat-x" : pattern.repeatY ? "repeat-y" : "no-repeat";
        const fill = source ? context.createPattern(source, repetition) : null;
        if (fill) {
          fill.setTransform(new Matrix([periodX / sourceWidth, 0, 0, periodY / sourceHeight, pattern.tile.x, pattern.tile.y]));
          context.fillStyle = fill;
          const x = Math.round(pattern.tile.x);
          const y = Math.round(pattern.tile.y);
          context.fillRect(
            pattern.repeatX ? plan.clip.x : x,
            pattern.repeatY ? plan.clip.y : y,
            pattern.repeatX ? plan.clip.width : Math.round(pattern.tile.x + pattern.tile.width) - x,
            pattern.repeatY ? plan.clip.height : Math.round(pattern.tile.y + pattern.tile.height) - y,
          );
          filled = true;
        }
      }
      if (!filled) {
        for (const tile of plan.tiles) {
          if (tile.width > 0 && tile.height > 0) drawPicture(context, bitmap, tile.x, tile.y, tile.width, tile.height);
        }
      }
      if (clipped) context.restore!();
    });
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

  get poseBytes(): number {
    let bytes = 0;
    for (const image of this.images) {
      for (const set of image.poses?.sets ?? []) {
        for (const frame of set.frames.values()) if (!frame.refused) bytes += set.width * set.height * FRAME_BYTES_PER_PIXEL;
      }
    }
    return bytes;
  }

  protected posing(still: StillPicture): boolean {
    const under = still.under;
    return (
      !!under &&
      !under.picture &&
      under.inner.length === 0 &&
      !!still.picture.vector &&
      still.span === 1 &&
      !still.broken &&
      !still.undrawn &&
      !this.uncomposited(under)
    );
  }

  protected posingStill(image: ImageState): StillPicture | undefined {
    return this.stills.find((still) => still.under === image && this.posing(still));
  }

  protected preparePoses(image: ImageState, still: StillPicture) {
    const artifact = this.liveArtifact(image.slot);
    if (!artifact || !still.files) {
      this.releasePoses(image);
      return;
    }
    if (image.poses?.artifact !== artifact || image.poses.still !== still) {
      this.releasePoses(image);
      image.poses = { artifact, still, sets: [], shown: REST_POSE };
    }
    this.wantPoses(image);
  }

  protected releasePoses(image: ImageState) {
    for (const set of image.poses?.sets ?? []) this.releasePoseSet(set);
    image.poses = undefined;
  }

  protected releasePoseSet(set: PoseSet) {
    set.released = true;
    set.queue = [];
    for (const frame of set.frames.values()) {
      frame.raster?.release();
      frame.raster = undefined;
    }
  }

  protected poseSizes(still: StillPicture): { width: number; height: number }[] {
    const sizes = [still.rasters.get(0)?.want, still.next && !still.next.refused ? still.next.rasters.get(0)?.want : undefined];
    return sizes.filter((size): size is { width: number; height: number } => !!size);
  }

  protected wantPoses(image: ImageState) {
    const poses = image.poses;
    if (!poses || !this.active) return;
    const shown = poses.still.rasters.get(0);
    const sizes = this.poseSizes(poses.still);
    const sized = (set: PoseSet, size: { width: number; height: number } | undefined) => !!size && set.width === size.width && set.height === size.height;
    const kept = (set: PoseSet) => sizes.some((size) => sized(set, size)) || (!!shown?.image && sized(set, shown));
    for (const set of poses.sets) if (!kept(set)) this.releasePoseSet(set);
    poses.sets = poses.sets.filter((set) => !set.released);
    for (const size of sizes) {
      if (poses.sets.some((set) => sized(set, size))) continue;
      const set = this.planPoses(image, poses.artifact, size);
      poses.sets.push(set);
      set.running = true;
      const view = this.span.ownerDocument.defaultView;
      const start = () => {
        set.running = false;
        this.drawPoses(image, set);
      };
      if (view) view.setTimeout(start, 0);
      else start();
    }
    poses.last = undefined;
    this.renderPoses(image);
  }

  protected planPoses(image: ImageState, artifact: MorphArtifact, size: { width: number; height: number }): PoseSet {
    const plays = image.plays.map(({ play }) => play);
    const rate = Number.isFinite(this.playback.frameRate) && this.playback.frameRate > 0 ? this.playback.frameRate : 0;
    const cut = plays.map((play) => cutMorph(artifact, play));
    const full = plays.map((play, i) => {
      if (cut[i]) return undefined;
      const jumps = morphEasingJumps(play.timing.easing);
      if (jumps !== undefined) return Math.min(MAX_POSE_FRAMES, jumps);
      const duration = Number.isFinite(play.timing.duration) && play.timing.duration > 0 ? play.timing.duration : 0;
      return rate > 0 ? Math.min(MAX_POSE_FRAMES, Math.max(1, Math.round(duration * rate))) : 0;
    });
    const bytes = size.width * size.height * FRAME_BYTES_PER_PIXEL;
    const room = (this.playback.frameBudget?.() ?? Infinity) - this.playback.frameBytes();
    const rest = frameText(morphFrameState(artifact, morphPosesAt(artifact, {})));
    const cutOptions = plays.map((play, i) => (cut[i] ? cutOffsets(artifact, play.morph) : []));
    const cutLooks = plays.map((play, i) =>
      cut[i] ? new Set(cutOptions[i]!.map((at) => frameText(morphFrameState(artifact, morphPosesAt(artifact, { [play.morph]: at }))))).add(rest).size : 1,
    );
    const counts = (grids: (number | undefined)[]) => {
      let combinations = 1;
      let looks = 1;
      let cutOnly = 1;
      grids.forEach((grid, i) => {
        if (grid === undefined) {
          combinations *= cutOptions[i]!.length + 1;
          looks *= cutLooks[i]!;
          cutOnly *= cutLooks[i]!;
          return;
        }
        const tween = grid > 0 ? grid + 1 : 0;
        combinations *= tween + 1;
        looks *= tween + 1;
      });
      return { combinations, frames: looks - 1, tweenFrames: looks - cutOnly };
    };
    const bounded = (grids: (number | undefined)[]) => {
      const { combinations, frames } = counts(grids);
      return combinations <= MAX_POSE_COMBINATIONS && frames <= MAX_POSE_FRAMES;
    };
    const fits = (grids: (number | undefined)[]) => bounded(grids) && counts(grids).tweenFrames * bytes <= room;
    const most = Math.max(0, ...full.map((grid) => grid ?? 0));
    const scaled = (share: number) => full.map((grid) => (grid === undefined ? undefined : most > 0 ? Math.floor((grid * share) / most) : 0));
    if (fits(full)) return this.enumeratePoses(artifact, plays, cut, size, full, cutOptions, rest);
    let low = 1;
    let high = most - 1;
    let best = 0;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (fits(scaled(mid))) {
        best = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    const chosen = scaled(best);
    for (let i = plays.length - 1; i >= 0 && !bounded(chosen); i--) if (chosen[i] === undefined) chosen[i] = 0;
    return this.enumeratePoses(artifact, plays, cut, size, chosen, cutOptions, rest);
  }

  protected enumeratePoses(
    artifact: MorphArtifact,
    plays: MorphPlay[],
    cut: boolean[],
    size: { width: number; height: number },
    grids: (number | undefined)[],
    cutOptions: number[][],
    rest: string,
  ): PoseSet {
    const cutGroups = new Set(plays.flatMap((play, i) => (cut[i] ? [...morphGroups(artifact, play.morph)] : [])));
    const options = plays.map((_, i): PoseHead[] => {
      const grid = grids[i];
      if (grid === undefined) return [REST_POSE, ...cutOptions[i]!];
      return [REST_POSE, ...Array.from({ length: grid > 0 ? grid + 1 : 0 }, (_, k) => k / grid)];
    });
    const set: PoseSet = { width: size.width, height: size.height, grids: [...grids], cut: cutGroups, keys: new Map(), frames: new Map(), queue: [], running: false };
    const heads: PoseHead[] = plays.map(() => REST_POSE);
    const visit = (at: number) => {
      if (at < plays.length) {
        for (const head of options[at]!) {
          heads[at] = head;
          visit(at + 1);
        }
        return;
      }
      const key = poseKey(artifact, plays, heads, cutGroups);
      if (set.keys.has(key)) return;
      const offsets = poseOffsets(plays, heads);
      const motions = plays.flatMap((play, i) => {
        const head = heads[i]!;
        return head !== REST_POSE && movesLayers(play) ? [{ play: i, offset: head }] : [];
      });
      const text = offsets ? frameText(morphFrameState(artifact, morphPosesAt(artifact, offsets))) : rest;
      const moved = motions
        .map(({ play, offset }) => Object.entries(plays[play]!.motion ?? {}).map(([label, track]) => `|${label}@${motionOffset(track, offset)}`).join(""))
        .join("");
      const id = motions.length === 0 && text === rest ? REST_POSE : hashText(`${text}${moved}`);
      set.keys.set(key, id);
      if (id === REST_POSE || set.frames.has(id)) return;
      set.frames.set(id, { offsets: { ...offsets }, motions });
      set.queue.push(id);
    };
    visit(0);
    return set;
  }

  protected drawPoses(image: ImageState, set: PoseSet) {
    const poses = image.poses;
    if (!poses || set.running || set.released || !this.active) return;
    const id = set.queue.shift();
    if (id === undefined) {
      this.checkDrawn();
      return;
    }
    const frame = set.frames.get(id)!;
    const files = poses.still.files;
    const text = files ? this.poseMarkup(image, poses.artifact, frame) : undefined;
    set.running = true;
    const made =
      text && files
        ? this.playback
            .rasterizeSvgLayer({ text, viewBox: !!poses.artifact.viewBox }, { width: files.width, height: files.height }, set.width, set.height, this.span.ownerDocument)
            .catch(() => undefined)
        : Promise.resolve(undefined);
    void made.then((raster) => {
      set.running = false;
      if (set.released || !this.active || image.poses !== poses) {
        raster?.release();
        return;
      }
      if (raster) frame.raster = raster;
      else {
        frame.refused = true;
        if (!poses.reported) {
          poses.reported = true;
          this.reportMorph(image, { image: image.plays[0]!.play.ref.image, file: poses.still.picture.files[0]?.name ?? "", reason: "undrawn" });
        }
      }
      poses.last = undefined;
      this.renderPoses(image);
      this.drawPoses(image, set);
    });
  }

  protected poseMarkup(image: ImageState, artifact: MorphArtifact, frame: PoseFrame): string | undefined {
    const markup = renderMorphAt(artifact, frame.offsets);
    const files = image.poses?.still.files;
    if (frame.motions.length === 0 || !files) return markup;
    const moves = (label: string) =>
      frame.motions.flatMap(({ play, offset }) => {
        const motion = image.plays[play]?.play.motion;
        const track = motion ? own(motion, label) : undefined;
        return track ? [{ track, offset }] : [];
      });
    return movedMarkup(markup, this.playback.overlay, files, moves, this.playback.animate);
  }

  protected poseHeads(plays: { occurrence?: Occurrence }[], turned?: boolean): PoseHead[] {
    return plays.map(({ occurrence }) => {
      const head = occurrence ? this.playback.playhead(occurrence) : undefined;
      if (!head || !("offset" in head)) return turned ? 0 : REST_POSE;
      return turned ? 1 - head.offset : head.offset;
    });
  }

  protected shownPoseSet(poses: PoseFrames): PoseSet | undefined {
    const raster = poses.still.rasters.get(0);
    const sized = (set: PoseSet, size: { width: number; height: number } | undefined) => !!size && set.width === size.width && set.height === size.height;
    return poses.sets.find((set) => !!raster?.image && sized(set, raster)) ?? poses.sets.find((set) => sized(set, raster?.want));
  }

  protected renderPoses(image: ImageState) {
    const poses = image.poses;
    if (!poses || this.frozen || this.disposed) return;
    const set = this.shownPoseSet(poses);
    const heads = this.poseHeads(image.plays, image.turned);
    const signature = `${set ? `${set.width}x${set.height}` : ""}|${heads.join(",")}`;
    if (poses.last === signature) return;
    poses.last = signature;
    const plays = image.plays.map(({ play }) => play);
    const key = set ? poseKey(poses.artifact, plays, heads.map((head, i) => quantizePose(head, set.grids[i])), set.cut) : REST_POSE;
    const id = set?.keys.get(key) ?? REST_POSE;
    const shown = id !== REST_POSE && set?.frames.get(id)?.raster ? id : REST_POSE;
    const showing = shown === REST_POSE ? undefined : set;
    if (shown === poses.shown && showing === poses.showing) return;
    poses.shown = shown;
    poses.showing = showing;
    for (const view of poses.still.canvases ?? []) if (view.still) this.paintStill(view, view.still, poses.still);
  }

  protected poseRaster(picture: StillPicture, index: number): { id: string; image: CanvasImageSource; width: number; height: number } | undefined {
    const poses = picture.under?.poses;
    const set = poses?.showing;
    if (!poses || poses.still !== picture || index !== 0 || !set || set.released) return undefined;
    const raster = set.frames.get(poses.shown)?.raster;
    return raster ? { id: poses.shown, image: raster.image, width: set.width, height: set.height } : undefined;
  }

  protected posesDrawn(image: ImageState): boolean {
    const state = image.slot.state;
    if (state === "idle" || state === "pending") return false;
    if (!this.liveArtifact(image.slot)) return true;
    const poses = image.poses;
    if (!poses) return false;
    return this.poseSizes(poses.still).every((size) =>
      poses.sets.some((set) => set.width === size.width && set.height === size.height && !set.running && set.queue.length === 0),
    );
  }

  protected liveArtifact(slot: MorphArtifactSlot): MorphArtifact | undefined {
    return slot.state === "ready" && slot.artifact?.status === "live" ? slot.artifact : undefined;
  }

  protected uncomposited(image: ImageState): boolean {
    return image.slot.state === "failed" || (image.slot.state === "ready" && image.slot.artifact?.status !== "live") || !!image.broken;
  }

  protected unbuild() {
    if (!this.shadowHost) return;
    this.shadowHost.remove();
    this.shadowHost = undefined;
    this.statics = [];
    this.backdrop = undefined;
    this.span.style.setProperty("background-image", this.layers.map((layer, index) => (this.loadingStill(index) ? "none" : layer)).reverse().join(", "));
  }

  protected layerStyle(computed: CSSStyleDeclaration | undefined, cssIndex: number): string {
    if (!computed) return "background-repeat:no-repeat";
    const value = (name: string) => layerValue(computed.getPropertyValue(name), cssIndex);
    const blend = value("background-blend-mode");
    return [
      ...["background-size", "background-position", "background-repeat", "background-origin", "background-clip"].map((name) => {
        const v = value(name);
        return v ? `${name}:${v}` : "";
      }),
      blend && blend !== "normal" ? `mix-blend-mode:${blend}` : "",
    ]
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

  protected stillCanvas(files: PictureFiles, segment: StillSegment, doc: Document): StillCanvas | undefined {
    const canvas = doc.createElement("canvas");
    const context = this.playback.pictureCanvas(canvas);
    if (!context) return undefined;
    canvas.setAttribute("style", "position:absolute;inset:0;width:100%;height:100%;display:block");
    const box = doc.createElement("div");
    box.setAttribute("style", "position:absolute;left:0;top:0;width:0;height:0");
    box.appendChild(canvas);
    return { box, canvas, context, files, segment };
  }

  protected canvasView(state: ImageState, doc: Document): CanvasView | undefined {
    const files = state.files!;
    const box = doc.createElement("div");
    box.setAttribute("style", "position:absolute;left:0;top:0;width:0;height:0;overflow:hidden");
    const views = new Map<number, LiveView>();
    for (const inner of state.inner) {
      const artifact = this.liveArtifact(inner.slot);
      const view = artifact ? this.liveView(artifact, doc) : undefined;
      if (!view) continue;
      inner.view = view;
      views.set(inner.file, view);
    }
    const motions = layeredMorphMotions(files.model);
    const held = new Set<number>();
    files.model.chains.forEach(({ file }, at) => {
      if (views.has(file)) for (const { wrapper } of motions[at]!) held.add(wrapper);
    });
    const containers = new Map<number, Container>();
    const runs: CanvasRun[] = [];
    let current: CanvasRun | undefined;
    let open: number[] = [];
    const parent = () => (open.length ? containers.get(open[open.length - 1]!)!.element : box);
    for (const [at, { file }] of files.model.chains.entries()) {
      const path = motions[at]!.filter(({ wrapper }) => held.has(wrapper));
      let kept = 0;
      while (kept < open.length && kept < path.length && open[kept] === path[kept]!.wrapper) kept += 1;
      if (kept < open.length || kept < path.length) current = undefined;
      open = open.slice(0, kept);
      for (const { wrapper, label } of path.slice(kept)) {
        const element = doc.createElement("div");
        element.setAttribute("style", CONTAINER_STYLE);
        parent().appendChild(element);
        containers.set(wrapper, { element, label });
        open.push(wrapper);
      }
      const view = views.get(file);
      if (view) {
        current = undefined;
        parent().appendChild(view.box);
        continue;
      }
      if (!current) {
        const canvas = doc.createElement("canvas");
        const context = this.playback.pictureCanvas(canvas);
        if (!context) return undefined;
        canvas.setAttribute("style", "position:absolute;inset:0;width:100%;height:100%;display:block");
        parent().appendChild(canvas);
        current = { canvas, context, files: new Set() };
        runs.push(current);
      }
      current.files.add(file);
    }
    const standIns = new Map<string, StandIn>();
    const labels = new Set(motions.flatMap((chain) => chain.map(({ label }) => label)));
    if (labels.size) {
      const stage = doc.createElement("div");
      stage.setAttribute("style", "position:absolute;left:0;top:0;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none");
      for (const label of labels) {
        const element = doc.createElement("div");
        element.setAttribute("style", `position:absolute;left:0;top:0;width:${files.width}px;height:${files.height}px;transform-origin:50% 50%`);
        stage.appendChild(element);
        standIns.set(label, { element });
      }
      box.appendChild(stage);
    }
    return { box, runs, views, containers, files, drawn: layeredMorphDrawn(files.model), standIns, groups: [] };
  }

  protected canvasBacking(view: CanvasView, width: number, height: number, dpr: number) {
    const resolution = Math.max(view.files.width / Math.max(1, width * dpr), view.files.height / Math.max(1, height * dpr));
    const scale = Math.max(1, Math.min(this.reach(), resolution));
    const pixels = Math.max(1, width * dpr * scale) * Math.max(1, height * dpr * scale);
    const shrink = pixels > MAX_CANVAS_PIXELS ? Math.sqrt(MAX_CANVAS_PIXELS / pixels) : 1;
    return { w: Math.max(1, Math.round(width * dpr * scale * shrink)), h: Math.max(1, Math.round(height * dpr * scale * shrink)) };
  }

  protected placeCanvas(view: CanvasView, rect: Rect) {
    const win = this.span.ownerDocument.defaultView;
    const dpr = win?.devicePixelRatio && win.devicePixelRatio > 0 ? win.devicePixelRatio : 1;
    const rectKey = `${rect.x},${rect.y},${rect.width},${rect.height}`;
    const snapped = view.snap;
    const next = view.next;
    const adopt = !!next && next.rect === rectKey && next.pending === 0 && snapped?.rect !== rectKey;
    if (snapped && !this.settling && !adopt && view.runs.some((run) => run.painted !== undefined)) {
      if (snapped.rect !== rectKey) {
        const style = `position:absolute;left:${rect.x}px;top:${rect.y}px;width:${rect.width}px;height:${rect.height}px;overflow:hidden`;
        if (view.box.getAttribute("style") !== style) view.box.setAttribute("style", style);
        view.size = { width: rect.width, height: rect.height };
        this.settleSoon();
      } else {
        const wanted = this.canvasBacking(view, snapped.width, snapped.height, dpr);
        if (view.runs.some((run) => wanted.w > run.canvas.width || wanted.h > run.canvas.height)) this.settleSoon();
      }
      this.paint(view);
      return;
    }
    if (next && next.rect === rectKey && next.pending === 0) {
      view.next = undefined;
      if (next.refused !== undefined) {
        for (const raster of next.rasters.values()) raster.release();
        const image = this.images.find((entry) => entry.canvas === view);
        if (image) {
          image.broken = true;
          releaseFiles(view.files);
          const name = image.picture?.files[next.refused]?.name;
          if (name !== undefined) this.reportMorph(image, { image: image.plays[0]!.play.ref.image, file: name, reason: "undrawn" });
          this.build();
          return;
        }
      } else {
        for (const [file, made] of next.rasters) {
          const raster = view.files.rasters.get(file);
          if (!raster) {
            made.release();
            continue;
          }
          raster.release();
          raster.image = made.image;
          raster.release = made.release;
          raster.width = made.width;
          raster.height = made.height;
          raster.refused = undefined;
        }
      }
    }
    const { x, y, width, height } = this.canvasPlacement(rect, dpr);
    const style = `position:absolute;left:${x}px;top:${y}px;width:${width}px;height:${height}px;overflow:hidden`;
    if (view.box.getAttribute("style") !== style) view.box.setAttribute("style", style);
    if (!view.runs.some((run) => run.painted !== undefined) || adopt) this.measureStyle();
    const { w, h } = this.canvasBacking(view, width, height, dpr);
    view.snap = { x, y, width, height, rect: rectKey };
    for (const run of view.runs) {
      if (run.canvas.width !== w || run.canvas.height !== h) {
        run.canvas.width = w;
        run.canvas.height = h;
        run.painted = undefined;
      }
    }
    view.size = { width, height };
    for (const [file, raster] of view.files.rasters) {
      raster.want = { width: w, height: h };
      this.refitRaster(view.files, file, raster);
    }
    this.paint(view);
  }

  protected refitRaster(files: PictureFiles, file: number, raster: FileRaster) {
    const want = raster.want;
    const bitmap = files.bitmaps.get(file);
    if (raster.busy || files.released || !want || !bitmap?.vector) return;
    const key = `${want.width}x${want.height}`;
    if ((raster.width === want.width && raster.height === want.height) || raster.refused === key) return;
    raster.busy = true;
    void this.playback
      .rasterizeSvgLayer(bitmap.vector, { width: bitmap.width, height: bitmap.height }, want.width, want.height, this.span.ownerDocument)
      .catch(() => undefined)
      .then((made) => {
        raster.busy = false;
        if (files.released) {
          made?.release();
          return;
        }
        if (made) {
          raster.release();
          raster.image = made.image;
          raster.release = made.release;
          raster.width = want.width;
          raster.height = want.height;
          const view = this.images.find((image) => image.files === files)?.canvas;
          if (view) {
            for (const run of view.runs) run.painted = undefined;
            this.paint(view);
          }
          this.checkDrawn();
        } else {
          raster.refused = key;
          const image = this.images.find((entry) => entry.files === files);
          if (image) {
            image.broken = true;
            releaseFiles(files);
            const name = image.picture?.files[file]?.name;
            if (name !== undefined) this.reportMorph(image, { image: image.plays[0]!.play.ref.image, file: name, reason: "undrawn" });
            this.build();
            return;
          }
        }
        this.refitRaster(files, file, raster);
      });
  }

  protected paint(view: CanvasView) {
    const layers = view.drawn.map(({ file, opacity, motions }): PaintedLayer => {
      const drawnHere = motions.filter(({ wrapper }) => !view.containers.has(wrapper));
      let matrix: Affine | undefined;
      for (const { label } of motions) {
        const pose = view.standIns.get(label)?.pose;
        if (pose) matrix = multiply(matrix ?? IDENTITY, pose.matrix);
      }
      return {
        file,
        alpha: opacity,
        ...(matrix ? { matrix } : {}),
        wrappers: drawnHere.map(({ wrapper }) => wrapper),
        fades: drawnHere.map(({ label }) => view.standIns.get(label)?.pose?.opacity ?? 1),
      };
    });
    const smooth = view.smooth !== false;
    for (const run of view.runs) {
      const { canvas, context } = run;
      const own = layers.filter(({ file }) => run.files.has(file));
      const key = `${canvas.width}x${canvas.height}|${smooth}|${own.map(({ file, alpha, matrix, fades }) => `${file}:${alpha}:${fades.join(" ")}${matrix ? `:${matrix.join(" ")}` : ""}`).join(",")}`;
      if (run.painted === key) continue;
      run.painted = key;
      clearCanvas(context, canvas, smooth);
      this.paintLayers(view, run, context, own, 0, 1);
    }
    for (const [file, live] of view.views) {
      const layer = layers.find((entry) => entry.file === file);
      const declarations = ["position:absolute;left:0;top:0;width:100%;height:100%"];
      if (!layer) declarations.push("display:none");
      else {
        const opacity = layer.fades.reduce((product, fade) => product * fade, layer.alpha);
        if (layer.matrix && view.size) {
          const [a, b, c, d, e, f] = layer.matrix;
          const sx = view.size.width / view.files.width;
          const sy = view.size.height / view.files.height;
          declarations.push("transform-origin:0 0", `transform:matrix(${a}, ${(b * sy) / sx}, ${(c * sx) / sy}, ${d}, ${e * sx}, ${f * sy})`);
        }
        if (opacity < 1) declarations.push(`opacity:${opacity}`);
      }
      write(live.box, "style", declarations.join(";"));
    }
    for (const { element, label } of view.containers.values()) {
      const opacity = view.standIns.get(label)?.pose?.opacity ?? 1;
      write(element, "style", opacity < 1 ? `${CONTAINER_STYLE};opacity:${opacity}` : CONTAINER_STYLE);
    }
  }

  protected paintLayers(view: CanvasView, run: CanvasRun, context: PictureCanvasContext, layers: PaintedLayer[], depth: number, alpha: number) {
    for (let start = 0; start < layers.length; ) {
      const first = layers[start]!;
      const wrapper = first.wrappers[depth];
      let end = start + 1;
      while (wrapper !== undefined && end < layers.length && layers[end]!.wrappers[depth] === wrapper) end += 1;
      const span = layers.slice(start, end);
      start = end;
      if (span.length === 1) {
        this.paintLayer(view, run, context, first, first.fades.slice(depth).reduce((product, fade) => product * fade, alpha));
        continue;
      }
      const fade = first.fades[depth]!;
      if (fade <= 0) continue;
      const group = fade < 1 ? this.groupCanvas(view, run, depth) : undefined;
      if (!group) {
        this.paintLayers(view, run, context, span, depth + 1, alpha * fade);
        continue;
      }
      clearCanvas(group.context, group.canvas, view.smooth !== false);
      this.paintLayers(view, run, group.context, span, depth + 1, 1);
      context.globalAlpha = alpha * fade;
      context.drawImage(group.canvas, 0, 0, run.canvas.width, run.canvas.height);
      context.globalAlpha = 1;
    }
  }

  protected paintLayer(view: CanvasView, run: CanvasRun, context: PictureCanvasContext, layer: PaintedLayer, alpha: number) {
    const { canvas } = run;
    const { files } = view;
    const bitmap = files.bitmaps.get(layer.file);
    const opacity = layer.alpha * alpha;
    if (!bitmap || opacity <= 0) return;
    context.globalAlpha = opacity;
    if (layer.matrix) {
      const [a, b, c, d, e, f] = layer.matrix;
      const sx = canvas.width / files.width;
      const sy = canvas.height / files.height;
      context.setTransform(a, (b * sy) / sx, (c * sx) / sy, d, e * sx, f * sy);
    }
    const raster = files.rasters.get(layer.file)?.image;
    if (raster) context.drawImage(raster, 0, 0, canvas.width, canvas.height);
    else drawPicture(context, bitmap, 0, 0, canvas.width, canvas.height);
    if (layer.matrix) context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalAlpha = 1;
  }

  protected groupCanvas(view: CanvasView, run: CanvasRun, depth: number) {
    let group = view.groups[depth];
    if (!group) {
      const canvas = run.canvas.ownerDocument.createElement("canvas");
      const context = this.playback.pictureCanvas(canvas);
      if (!context) return undefined;
      group = { canvas, context };
      view.groups[depth] = group;
    }
    if (group.canvas.width !== run.canvas.width || group.canvas.height !== run.canvas.height) {
      group.canvas.width = run.canvas.width;
      group.canvas.height = run.canvas.height;
    }
    return group;
  }

  layout() {
    if (!this.shadowHost) return;
    const computed = this.computed();
    const count = this.layers.length;
    for (const { inner, layer } of this.alone) {
      if (inner.broken) continue;
      const artifact = this.liveArtifact(inner.slot);
      if (!!artifact && !!this.placement(artifact, computed, count - 1 - layer) !== !!inner.view) {
        this.build();
        return;
      }
    }
    for (const state of this.images) {
      const artifact = state.slot.state === "ready" ? state.slot.artifact : undefined;
      if (!artifact || artifact.status !== "live" || state.broken || (state.picture && !state.files)) continue;
      if (!state.picture && this.posingStill(state)) continue;
      const eligible = state.picture
        ? !!this.pictureRect(state.files, state.layer, computed)
        : !!this.placement(artifact, computed, count - 1 - state.layer);
      if (eligible !== !!(state.picture ? state.canvas : state.view)) {
        this.build();
        return;
      }
    }
    const content = this.layerBoxes(computed).content;
    const padding = this.layerBoxes(computed).padding;
    const inner = this.cornerRadii(computed, this.layerBoxes(computed), padding);
    const rounding = inner.some((radius) => radius > 0)
      ? `;border-radius:${inner[0]}px ${inner[2]}px ${inner[4]}px ${inner[6]}px / ${inner[1]}px ${inner[3]}px ${inner[5]}px ${inner[7]}px`
      : "";
    const frame = `inset:0;box-sizing:border-box;padding:${content.y}px ${padding.width - content.x - content.width}px ${padding.height - content.y - content.height}px ${content.x}px${rounding}`;
    for (const { div, layer } of this.statics) {
      const style = `position:absolute;${frame};background-image:${this.staticLayer(layer)};${this.layerStyle(computed, count - 1 - layer)}`;
      if (div.getAttribute("style") !== style) div.setAttribute("style", style);
    }
    this.isolateBackground(computed, frame);
    const area = this.areaOf(computed);
    this.arealess = !(area.width > 0 && area.height > 0);
    if (this.arealess) {
      this.checkDrawn();
      return;
    }
    const rendering = computed?.getPropertyValue("image-rendering") ?? "";
    const smooth = rendering !== "pixelated" && rendering !== "crisp-edges";
    for (const view of [...this.stills.flatMap((still) => still.canvases ?? []), ...this.images.map((image) => image.canvas)]) {
      if (view) view.smooth = smooth;
    }
    this.styled = this.styleKey();
    for (const still of this.stills) {
      if (still.canvases) this.placeStill(still, computed);
    }
    const place = (view: LiveView, layer: number) => {
      const rect = this.placement(view.artifact, computed, count - 1 - layer, area);
      if (!rect) return;
      for (const part of view.parts) {
        part.setAttribute("x", String(rect.x));
        part.setAttribute("y", String(rect.y));
        part.setAttribute("width", String(rect.width));
        part.setAttribute("height", String(rect.height));
      }
    };
    for (const state of this.images) {
      if (state.canvas) {
        const rect = this.pictureRect(state.files, state.layer, computed, area);
        if (rect) this.placeCanvas(state.canvas, rect);
        continue;
      }
      if (state.view) place(state.view, state.layer);
    }
    for (const { inner, layer } of this.alone) if (inner.view) place(inner.view, layer);
    this.checkDrawn();
  }

  protected arealess = false;

  protected isolateBackground(computed: CSSStyleDeclaration | undefined, frame: string) {
    const host = this.shadowHost!;
    const blending = (computed?.getPropertyValue("background-blend-mode") ?? "")
      .split(",")
      .some((mode) => mode.trim() !== "" && mode.trim() !== "normal");
    const hostStyle = blending ? `${HOST_STYLE};isolation:isolate` : HOST_STYLE;
    if (host.getAttribute("style") !== hostStyle) host.setAttribute("style", hostStyle);
    if (!blending) {
      this.backdrop?.remove();
      this.backdrop = undefined;
      return;
    }
    const backdrop = (this.backdrop ??= this.span.ownerDocument.createElement("div"));
    const clip = layerValue(computed?.getPropertyValue("background-clip") ?? "", this.layers.length - 1);
    const color = computed?.getPropertyValue("background-color") || "transparent";
    const style = `position:absolute;${frame};background-color:${color}${clip ? `;background-clip:${clip}` : ""}`;
    if (backdrop.getAttribute("style") !== style) backdrop.setAttribute("style", style);
    const root = host.shadowRoot!;
    if (root.firstChild !== backdrop) root.insertBefore(backdrop, root.firstChild);
  }

  render() {
    if (this.frozen || this.disposed) return;
    for (const image of this.images) {
      if (image.canvas) {
        const canvas = image.canvas;
        this.renderFrame(
          canvas,
          image.slot.artifact,
          image.plays,
          (frame, heads) => {
            canvas.drawn = layeredMorphDrawn(canvas.files.model, frame);
            image.plays.forEach(({ play }, i) => this.moveStandIns(canvas, play, heads[i]!));
            this.paint(canvas);
          },
          image.turned,
        );
      }
      if (image.view) this.renderView(image.view, image.plays, image.turned);
      if (image.poses) this.renderPoses(image);
      for (const inner of image.inner) if (inner.view) this.renderView(inner.view, inner.plays);
    }
  }

  protected renderView(view: LiveView, plays: { play: MorphPlay; occurrence?: Occurrence }[], turned?: boolean) {
    this.renderFrame(
      view,
      view.artifact,
      plays,
      (frame, heads) => {
        applyFrame(view, frame);
        plays.forEach(({ play }, i) => this.moveLayers(view, play, heads[i]!));
      },
      turned,
    );
  }

  protected renderFrame(
    target: { last?: string },
    artifact: MorphArtifact | undefined,
    plays: { play: MorphPlay; occurrence?: Occurrence }[],
    draw: (frame: MorphFrameState, heads: (number | "rest")[]) => void,
    turned?: boolean,
  ) {
    if (!artifact || !plays.some((p) => p.occurrence)) return;
    const heads = plays.map(({ occurrence }) => {
      const head = occurrence ? this.playback.playhead(occurrence) : undefined;
      if (!head || !("offset" in head)) return turned ? 0 : ("rest" as const);
      return turned ? 1 - head.offset : head.offset;
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

  protected moveStandIns(view: CanvasView, play: MorphLayerPlay, at: number | "rest") {
    const box = { width: view.files.width, height: view.files.height };
    for (const [label, standIn] of view.standIns) {
      const track = play.motion && own(play.motion, label);
      if (!track) continue;
      if (at === "rest") {
        standIn.effect?.cancel();
        standIn.pose = undefined;
        continue;
      }
      if (standIn.effect === undefined) standIn.effect = this.playback.animate(standIn.element, morphMotionKeyframes(track) as Keyframe[]) ?? null;
      if (!standIn.effect) continue;
      standIn.effect.sample(at);
      standIn.pose = this.playback.readPose(standIn.element, box);
    }
  }

  protected releaseMotions() {
    for (const image of this.images) {
      for (const view of [image.view, ...image.inner.map((inner) => inner.view)]) {
        for (const motion of view?.motions ?? []) motion.effect?.cancel();
      }
      for (const standIn of image.canvas?.standIns.values() ?? []) standIn.effect?.cancel();
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
    for (const resolve of this.drawnWaiters.splice(0)) resolve();
  }

  dispose() {
    if (this.disposed) return;
    this.freeze();
    this.disposed = true;
    this.releaseMotions();
    for (const image of this.images) {
      image.slot.dispose();
      image.loading = undefined;
      releaseFiles(image.files);
      if (image.canvas) this.dropCanvasNext(image.canvas);
      image.view = undefined;
      image.canvas = undefined;
      this.releasePoses(image);
      for (const inner of image.inner) {
        inner.slot.dispose();
        inner.view = undefined;
      }
    }
    for (const still of this.stills) {
      still.canvases = undefined;
      this.releaseStill(still);
    }
    for (const entry of this.outlines) this.dropOutline(entry);
    if (this.settleTimer !== undefined) this.span.ownerDocument.defaultView?.clearTimeout(this.settleTimer);
    this.settleTimer = undefined;
    this.playback.forget(this);
    delete (this.span as HTMLElement & { __sdMorph?: MorphLayer }).__sdMorph;
  }
}

function lastAtOrBelow(easing: MorphEasing, offset: number): { position: number; value: number } {
  const eased = (position: number) => Math.max(0, Math.min(1, easing(position)));
  const steps = 1000;
  let below = -1;
  for (let i = steps; i >= 0; i -= 1) {
    if (eased(i / steps) <= offset) {
      below = i;
      break;
    }
  }
  if (below < 0) return { position: 0, value: eased(0) };
  if (below === steps) return { position: 1, value: eased(1) };
  let lo = below / steps;
  let hi = (below + 1) / steps;
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    if (eased(mid) <= offset) lo = mid;
    else hi = mid;
  }
  return { position: lo, value: eased(lo) };
}

function sameOutside(a: string, b: string, groups: readonly string[]): boolean {
  let first: unknown;
  let second: unknown;
  try {
    first = JSON.parse(a);
    second = JSON.parse(b);
  } catch {
    return false;
  }
  if (!first || !second || typeof first !== "object" || typeof second !== "object") return false;
  const left = first as Record<string, unknown>;
  const right = second as Record<string, unknown>;
  const names = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...names].every((name) => groups.includes(name) || left[name] === right[name]);
}

function changePair(ref: MorphRef, morph: string): { from: string; to: string; kept: string; groups: string[] } | undefined {
  const text = ref.recipes?.[morph];
  if (text === undefined) return undefined;
  let recipe: unknown;
  try {
    recipe = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!recipe || typeof recipe !== "object") return undefined;
  const { keyframes, ...kept } = recipe as { keyframes?: { offset?: unknown; states?: unknown }[] };
  if (!Array.isArray(keyframes) || keyframes.length !== 2 || keyframes[0]?.offset !== 0 || keyframes[1]?.offset !== 1) return undefined;
  const { states: from } = keyframes[0];
  const { states: to } = keyframes[1];
  if (!from || !to || typeof from !== "object" || typeof to !== "object") return undefined;
  const groups = [...new Set([...Object.keys(from), ...Object.keys(to)])];
  return { from: JSON.stringify(from), to: JSON.stringify(to), kept: JSON.stringify(kept), groups };
}

function morphGroups(artifact: MorphArtifact, morph: string): Set<string> {
  return new Set(Object.entries(artifact.groups).flatMap(([group, owner]) => (owner === morph ? [group] : [])));
}

function movesLayers(play: MorphPlay): boolean {
  return Object.keys(play.motion ?? {}).length > 0;
}

function cutMorph(artifact: MorphArtifact, play: MorphPlay): boolean {
  if (movesLayers(play)) return false;
  const groups = morphGroups(artifact, play.morph);
  return (
    !(artifact.paints ?? []).some((entry) => groups.has(entry.group)) &&
    artifact.segments.every(
      (segment) => !groups.has(segment.group) || (segment.clips.length === 0 && segment.transitions.every((t) => t.kind === "cut" || t.kind === "hold")),
    )
  );
}

function cutOffsets(artifact: MorphArtifact, morph: string): number[] {
  const groups = morphGroups(artifact, morph);
  const marks = new Set([0, 1]);
  for (const segment of artifact.segments) {
    if (!groups.has(segment.group)) continue;
    marks.add(segment.from.offset);
    marks.add(segment.to.offset);
  }
  for (const [group, entries] of Object.entries(artifact.schedules)) {
    if (groups.has(group)) for (const entry of entries) marks.add(entry.offset);
  }
  const sorted = [...marks].filter((at) => Number.isFinite(at) && at >= 0 && at <= 1).sort((a, b) => a - b);
  return sorted.flatMap((at, i) => {
    const next = sorted[i + 1];
    return next !== undefined && next > at ? [at, (at + next) / 2] : [at];
  });
}

export function movedMarkup(
  markup: string,
  host: Element,
  natural: { width: number; height: number },
  moves: (label: string) => { track: readonly MorphMotionFrame[]; offset: number }[],
  animate: MorphMotionAnimator,
): string | undefined {
  const doc = host.ownerDocument;
  const view = doc.defaultView as (Window & typeof globalThis) | null;
  if (!view?.DOMParser || !view.XMLSerializer) return undefined;
  const svg = doc.importNode(new view.DOMParser().parseFromString(markup, "image/svg+xml").documentElement, true);
  const stage = doc.createElement("div");
  stage.setAttribute("style", `position:absolute;left:0;top:0;width:${natural.width}px;height:${natural.height}px;overflow:hidden;visibility:hidden;pointer-events:none`);
  stage.appendChild(svg);
  host.appendChild(stage);
  try {
    for (const element of Array.from(svg.querySelectorAll("[data-morph-motion]"))) {
      for (const { track, offset } of moves(element.getAttribute("data-morph-motion")!)) {
        const effect = animate(element, morphMotionKeyframes(track) as Keyframe[]);
        if (!effect?.commit) return undefined;
        try {
          effect.sample(offset);
          effect.commit();
        } finally {
          effect.cancel();
        }
      }
    }
    return new view.XMLSerializer().serializeToString(svg);
  } catch {
    return undefined;
  } finally {
    stage.remove();
  }
}

function motionOffset(track: readonly MorphMotionFrame[], offset: number): number {
  if (offset < 1) return offset;
  const keys = new Set(track.flatMap(({ values }) => Object.keys(values)));
  const loops = [...keys].every((key) => {
    const set = track.filter(({ values }) => (values as Record<string, string | undefined>)[key] !== undefined);
    return (set[0]?.values as Record<string, string | undefined>)[key] === (set.at(-1)?.values as Record<string, string | undefined>)[key];
  });
  return loops ? 0 : offset;
}

function poseOffsets(plays: readonly MorphPlay[], heads: readonly PoseHead[]): Record<string, number> | undefined {
  const offsets: Record<string, number> = Object.create(null);
  plays.forEach((play, i) => {
    const at = heads[i];
    if (at !== undefined && at !== REST_POSE) offsets[play.morph] = at;
  });
  return Object.keys(offsets).length ? offsets : undefined;
}

function quantizePose(head: PoseHead, grid: number | undefined): PoseHead {
  if (head === REST_POSE || grid === undefined) return head;
  return grid > 0 ? Math.round(head * grid) / grid : REST_POSE;
}

function groupPoseText(group: string, pose: MorphGroupPose, cut: boolean): string {
  if (!("segment" in pose)) return `${group}=${pose.state}/${pose.last ?? ""}`;
  const at = cut ? (pose.progress <= 0 ? "0" : pose.progress >= 1 ? "1" : "m") : String(pose.progress);
  return `${group}@${pose.segment}:${at}`;
}

function poseKey(artifact: MorphArtifact, plays: readonly MorphPlay[], heads: readonly PoseHead[], cut: ReadonlySet<string>): string {
  const offsets = poseOffsets(plays, heads);
  if (!offsets) return REST_POSE;
  const poses = morphPosesAt(artifact, offsets);
  const parts = Object.keys(poses)
    .sort()
    .map((group) => groupPoseText(group, poses[group]!, cut.has(group)));
  plays.forEach((play, i) => {
    if (heads[i] !== REST_POSE && movesLayers(play)) parts.push(`~${i}@${heads[i]}`);
  });
  return parts.join("|");
}

function frameText(state: MorphFrameState): string {
  const byName = <V>(map: Map<string, V>): [string, V][] => [...map].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return JSON.stringify([
    [...state.shown].sort(),
    [...state.hidden].sort(),
    byName(state.geometry),
    byName(state.paint).map(([node, values]) => [node, Object.entries(values).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))]),
    byName(state.gradients),
    byName(state.opacity).filter(([, opacity]) => opacity !== 1),
    byName(state.clips),
    byName(state.reaches),
    byName(state.spread),
    byName(state.masks),
  ]);
}

function releaseFiles(files: PictureFiles | undefined) {
  if (!files || files.released) return;
  files.released = true;
  for (const raster of files.rasters.values()) raster.release();
}

function clearCanvas(context: PictureCanvasContext, canvas: HTMLCanvasElement, smooth = true) {
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalAlpha = 1;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = smooth;
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

function drawPicture(context: Pick<PictureCanvasContext, "drawImage">, bitmap: PictureBitmap, x: number, y: number, width: number, height: number) {
  const box = bitmap.box;
  if (!box) {
    context.drawImage(bitmap.image, x, y, width, height);
    return;
  }
  if ((bitmap.image as { width?: unknown }).width === 0) return;
  const scaleX = width / bitmap.width;
  const scaleY = height / bitmap.height;
  context.drawImage(bitmap.image, x + box.x * scaleX, y + box.y * scaleY, box.width * scaleX, box.height * scaleY);
}

function write(element: Element, name: string, value: string | null) {
  if (element.getAttribute(name) === value) return;
  if (value === null) element.removeAttribute(name);
  else element.setAttribute(name, value);
}
