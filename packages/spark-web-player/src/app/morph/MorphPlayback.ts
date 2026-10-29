// Live portrait morphs on the page. An image write names the morphs that play
// on its layers (`WriteImageInstruction.content.morph`); this resolves each
// one's artifact, draws the layer as inline SVG once it is ready and poses it
// on a clock, following the playback rules of `@impower/sparkdown`'s
// `morph/render.ts`. Until an artifact is ready, or for good when it fails,
// the layer keeps the static image the write put up.
//
// One playback belongs to each overlay and outlives the UI managers a
// re-render swaps in, as the overlay's DOM does. What a morph's phase belongs
// to is its logical occurrence (the target, the image layer, the character
// and the morph definition), not the span or SVG drawing it: a compatible
// write or a reconciling re-render draws the same occurrence again at the
// same phase.

import { createMorphHost, MorphArtifactSlot, type MorphHost } from "../../../../sparkdown/src/morph/hosts";
import {
  APERTURE_REACH_CLIP_STYLE,
  morphFrameState,
  morphPosesAt,
  namespaceMorphMarkup,
  poseAperture,
  poseGradient,
  poseLeaf,
  type MorphFrameState,
} from "../../../../sparkdown/src/morph/render";
import { MorphBakeService } from "../../../../sparkdown/src/morph/service";
import { MorphTimeline, morphRandom } from "../../../../sparkdown/src/morph/timeline";
import type { MorphArtifact, MorphTiming } from "../../../../sparkdown/src/morph/types";
import type {
  MorphImageContent,
  MorphLayerPlay,
} from "../../../../spark-engine/src/game/modules/ui/classes/messages/WriteImageMessage";
import { backgroundRect, cssList, layerValue, svgIntrinsicSize } from "./backgroundFit";

export type { MorphImageContent, MorphLayerPlay };

/** One logical occurrence's schedule, shared by the drawings of it. */
export interface Occurrence {
  key: string;
  timing: MorphTiming;
  timeline: MorphTimeline;
  /** Playback time its cycle began at, moved on by preemptions. */
  start: number;
  /** Cycles begun, so each fresh cycle draws a fresh, reproducible schedule. */
  cycles: number;
  users: number;
  /** Open preemptions, and when the first began. */
  preempted: number;
  preemptedAt: number;
}

/** A play drawn live: its SVG, and the markup each posed element started from. */
interface LiveView {
  box: HTMLElement;
  artifact: MorphArtifact;
  prefix: string;
  /** Each part's own svg, nested in the box's svg root. */
  parts: Element[];
  leaves: { element: Element; node: string; style: string | null; d: string | null; opacity: string | null }[];
  clips: {
    id: string;
    element: Element;
    paths: { element: Element; d: string | null; style: string | null }[];
    /** The path of the clip path bounding the aperture's reach, once a frame has needed it. */
    reach?: Element;
  }[];
  /** The gradient copies moving leaves paint with, by id before occurrence namespacing. */
  gradients: {
    id: string;
    element: Element;
    attributes: Record<string, string>;
    stops: { element: Element; attributes: Record<string, string> }[];
  }[];
  /** The pose last written, so an unchanged frame writes nothing. */
  last?: string;
}

interface PlayState {
  play: MorphLayerPlay;
  slot: MorphArtifactSlot;
  occurrence?: Occurrence;
  view?: LiveView;
  /** Its artifact's parts would not parse: it stays with CSS. */
  broken?: boolean;
}

const SVG_NS = "http://www.w3.org/2000/svg";

const HOST_STYLE = "position:absolute;inset:0;overflow:hidden;pointer-events:none;mix-blend-mode:normal";

let occurrencePrefixes = 0;

export interface MorphPlaybackOptions {
  host?: MorphHost;
  /** Prefixes every occurrence's random stream. */
  seed?: string;
  requestFrame?: (callback: (now: number) => void) => number;
  cancelFrame?: (handle: number) => void;
}

export class MorphPlayback {
  /** The playback of `overlay`, made on first use. */
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

  /** Seconds of playback: advanced by the clock that drives it, never backwards. */
  protected time = 0;
  protected enabled = true;
  protected paused = false;
  protected session = "";
  /** The game clock driving playback; without one, playback runs on its own frames. */
  protected clockOwner?: object;
  protected frame?: number;
  protected frameTime?: number;

  protected layers = new Set<MorphLayer>();
  protected occurrences = new Map<string, Occurrence>();
  protected resizeObserver?: ResizeObserver;

  constructor(
    readonly overlay: HTMLElement,
    options: MorphPlaybackOptions = {},
  ) {
    const view = overlay.ownerDocument.defaultView;
    this.host = options.host ?? defaultHost(this.delivered);
    this.seed = options.seed ?? "";
    // A window without animation frames (a DOM without rendering) gets a
    // timer at the same rate.
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

  /** Replaces how artifacts are resolved, how schedules are seeded or how frames are requested. */
  configure(options: MorphPlaybackOptions) {
    if (options.host) this.host = options.host;
    if (options.seed !== undefined) this.seed = options.seed;
    if (options.requestFrame) this.requestFrame = options.requestFrame;
    if (options.cancelFrame) this.cancelFrame = options.cancelFrame;
  }

  get resolver(): MorphHost {
    return this.host;
  }

  /** An artifact the game baked for a reference with no asset service behind it. */
  deliver(params: { key: string; artifact?: MorphArtifact; error?: string }) {
    this.delivered.deliver(params.key, params);
  }

  /** How to ask the game for an artifact again, through the page's current connection to it. */
  set askGame(ask: ((key: string) => void) | undefined) {
    this.delivered.ask = ask;
  }

  protected relayoutQueued = false;

  /**
   * Places every live drawing again, once the current task's page updates
   * are done: a style or class change can move or resize the image CSS
   * draws without resizing the span the resize observer watches.
   */
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
    return this.enabled;
  }

  // Clock.

  /** A game clock drives playback from now on (PLAY, once its application starts). */
  attachClock(owner: object) {
    this.clockOwner = owner;
    this.stopFrames();
  }

  /** The clock `owner` attached no longer drives playback; its own frames take over. */
  detachClock(owner: object) {
    if (this.clockOwner !== owner) return;
    this.clockOwner = undefined;
    this.schedule();
  }

  /**
   * Moves playback on by `seconds`. Time that runs backwards (a clock stepped
   * back) starts every occurrence again at rest, since no earlier frame is
   * kept to return to.
   */
  advance(seconds: number) {
    if (!Number.isFinite(seconds) || seconds === 0) return;
    if (seconds < 0) {
      this.restartAll();
      this.render();
      return;
    }
    if (this.paused) return;
    this.time += seconds;
    this.render();
  }

  /**
   * Moves playback on by `seconds` whether or not the story is paused: the
   * game clock stepped (`Application.skip`), which moves a paused story's
   * frame too.
   */
  step(seconds: number) {
    const paused = this.paused;
    this.paused = false;
    try {
      this.advance(seconds);
    } finally {
      this.paused = paused;
    }
  }

  /** Story pause: every live morph freezes at the exact frame it shows. */
  setPaused(paused: boolean) {
    if (this.paused === paused) return;
    this.paused = paused;
    this.frameTime = undefined;
    if (paused) this.stopFrames();
    else this.schedule();
  }

  /**
   * The `Animate portraits` preference. Off returns every morph to rest and
   * keeps it there, pause or no pause; on starts each one on a fresh cycle.
   */
  setEnabled(enabled: boolean) {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    this.restartAll();
    this.render();
    this.schedule();
  }

  /**
   * What the page is showing: a play session, or the preview of one place.
   * A different session (PLAY starting, the preview moving to another line)
   * starts every occurrence again at rest; the same one again changes
   * nothing, so a re-render of the same place keeps its phase.
   */
  setSession(session: string) {
    if (this.session === session) return;
    this.session = session;
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
  }

  protected schedule() {
    if (this.frame !== undefined) return;
    if (this.clockOwner || this.paused || !this.enabled || ![...this.layers].some((layer) => layer.live)) {
      // An idle loop keeps no baseline: the frame that wakes it next counts
      // from itself, not from the last frame before it went idle.
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

  // Occurrences.

  protected acquire(key: string, timing: MorphTiming): Occurrence {
    let occurrence = this.occurrences.get(key);
    if (!occurrence) {
      occurrence = {
        key,
        timing,
        timeline: new MorphTimeline(timing, morphRandom(`${this.seed}|${key}|0`)),
        start: this.time,
        cycles: 0,
        users: 0,
        preempted: 0,
        preemptedAt: 0,
      };
      this.occurrences.set(key, occurrence);
    }
    occurrence.users += 1;
    return occurrence;
  }

  protected releaseOccurrence(occurrence: Occurrence) {
    occurrence.users -= 1;
    // A re-render empties a target before it writes it again: during a
    // reconcile pass an occurrence nothing draws waits for the pass's sweep,
    // so the write that follows draws it at the same phase.
    if (occurrence.users <= 0 && !this.reconciling && this.occurrences.get(occurrence.key) === occurrence) {
      this.occurrences.delete(occurrence.key);
    }
  }

  /** Whether a reconcile pass is open (`beginPass` to `endPass`). */
  protected reconciling = false;

  /** A re-render's reconcile pass opens: what it empties may be written again. */
  beginPass() {
    this.reconciling = true;
  }

  /** The pass is swept: an occurrence nothing draws again is gone. */
  endPass() {
    this.reconciling = false;
    for (const [key, occurrence] of this.occurrences) {
      if (occurrence.users <= 0) this.occurrences.delete(key);
    }
  }

  /**
   * Holds an occurrence at rest, its schedule stopped, until the returned
   * function is called: the seam a transient behavior (a later explicit
   * trigger) takes a portrait's groups over by. Preemptions nest; the
   * schedule resumes where it stopped once the last one ends.
   */
  preempt(key: string): () => void {
    const occurrence = this.occurrences.get(key);
    if (!occurrence) return () => {};
    if (occurrence.preempted++ === 0) occurrence.preemptedAt = this.time;
    this.render();
    let ended = false;
    return () => {
      if (ended) return;
      ended = true;
      if (--occurrence.preempted === 0) occurrence.start += this.time - occurrence.preemptedAt;
      this.render();
    };
  }

  /** The keys of the occurrences playing now, for tests and verification. */
  get occurrenceKeys(): string[] {
    return [...this.occurrences.keys()];
  }

  /** Where `key` is on its schedule now: its playhead, or rest when it does not play. */
  playhead(occurrence: Occurrence) {
    if (!this.enabled || occurrence.preempted) return { phase: "off" as const };
    return occurrence.timeline.at(this.time - occurrence.start);
  }

  // Layers.

  /**
   * Draws the morphs `content` names on `span`, a freshly written image
   * layer whose CSS images are `background`: live when `kind` is the
   * background, the static rest render when it is a mask. `base` names the
   * target and content element the write filled, the first part of each
   * play's occurrence.
   */
  mount(
    span: HTMLElement,
    content: MorphImageContent,
    background: string,
    kind: "background" | "mask",
    base: string,
  ): MorphLayer {
    const layer = new MorphLayer(this, span, content, background, kind, base);
    this.layers.add(layer);
    (span as HTMLElement & { __sdMorph?: MorphLayer }).__sdMorph = layer;
    layer.start();
    return layer;
  }

  /** Freezes every morph drawn in `root`: an outgoing layer holds its frame through its fade. */
  freezeWithin(root: Element) {
    for (const layer of this.layersWithin(root)) layer.freeze();
  }

  /** Lets go of every morph drawn in `root`, which is leaving the page. */
  releaseWithin(root: Element) {
    for (const layer of this.layersWithin(root)) layer.dispose();
  }

  protected layersWithin(root: Element): MorphLayer[] {
    return [...this.layers].filter((layer) => root === layer.span || root.contains(layer.span));
  }

  /** @internal */
  track(layer: MorphLayer) {
    this.resizeObserver?.observe(layer.span);
    this.schedule();
  }

  /** @internal */
  forget(layer: MorphLayer) {
    this.layers.delete(layer);
    this.resizeObserver?.unobserve(layer.span);
  }

  /** @internal */
  occurrenceFor(key: string, timing: MorphTiming) {
    return this.acquire(key, timing);
  }

  /** @internal */
  letGo(occurrence: Occurrence) {
    this.releaseOccurrence(occurrence);
  }

  /** Draws every live morph at the current time. */
  render() {
    for (const layer of [...this.layers]) {
      // A layer whose span left the page by a route that did not release it
      // goes now.
      if (!layer.span.isConnected) {
        layer.dispose();
        continue;
      }
      layer.render();
    }
  }

  /** How many layers are drawn and how many of them are live, for tests and verification. */
  get stats() {
    const layers = [...this.layers];
    return {
      layers: layers.length,
      live: layers.filter((l) => l.live).length,
      occurrences: [...this.occurrences.values()].filter((o) => o.users > 0).length,
    };
  }
}

/**
 * Artifacts the game sent for references the page cannot resolve itself
 * (`MorphArtifactMessage`): kept by key until a layer asks, a bounded few.
 */
class DeliveredArtifacts {
  static readonly LIMIT = 32;
  protected settled = new Map<string, { artifact?: MorphArtifact; error?: string }>();
  protected waiting = new Map<string, Set<() => void>>();

  /**
   * Asks the game for `key` (`MorphNeedMessage`); set by the UI manager that
   * hears the game. Asked on every miss: the game, which sends each key once
   * per connection on its own, sends it again unless that first send is
   * still under way.
   */
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

  /** The artifact for `key` once the game has sent it. */
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

/**
 * Resolves a reference through the asset service that serves its art (the
 * web editor's service worker), or, for one with no asset service behind
 * it (inline art: VS Code, local compiles), with the artifact the game
 * bakes from the program and sends.
 */
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

/** The morphs of one written image layer (an `instance` span). */
export class MorphLayer {
  protected plays: PlayState[] = [];
  protected frozen = false;
  protected disposed = false;
  protected shadowHost?: HTMLElement;
  /** The drawing's images CSS paints, by their place among the layers. */
  protected statics: { div: HTMLElement; layer: number }[] = [];

  /** Each image's CSS value, bottom first. */
  protected layers: string[];

  constructor(
    protected playback: MorphPlayback,
    readonly span: HTMLElement,
    protected content: MorphImageContent,
    background: string,
    protected kind: "background" | "mask",
    protected base: string,
  ) {
    this.layers = cssList(background).reverse();
  }

  get live(): boolean {
    return !this.frozen && !this.disposed && this.plays.some((p) => p.view);
  }

  /** Whether it holds a ready live artifact, drawn live now or kept static by its styles. */
  get drawable(): boolean {
    return (
      !this.frozen &&
      !this.disposed &&
      this.kind === "background" &&
      this.plays.some((p) => p.slot.state === "ready" && p.slot.artifact?.status === "live")
    );
  }

  start() {
    for (const play of this.content.plays) {
      const state: PlayState = { play, slot: undefined as unknown as MorphArtifactSlot };
      state.slot = new MorphArtifactSlot(this.playback.resolver, () => this.changed());
      if (this.kind === "background") {
        const key = [this.base, play.layer, play.ref.image, play.ref.morph, play.definition, this.content.epoch].join("|");
        state.occurrence = this.playback.occurrenceFor(key, play.timing);
      }
      this.plays.push(state);
    }
    this.playback.track(this);
    for (const state of this.plays) state.slot.set(state.play.ref);
  }

  /** The keys of this layer's occurrences. */
  get occurrenceKeys(): string[] {
    return this.plays.flatMap((p) => (p.occurrence ? [p.occurrence.key] : []));
  }

  protected changed() {
    if (this.disposed || this.frozen) return;
    // A layer whose span left the page by a route that did not release it,
    // and that no frame has rendered since, goes when its artifact settles.
    if (!this.span.isConnected) {
      this.dispose();
      return;
    }
    if (this.kind === "mask") {
      this.applyMask();
      return;
    }
    this.build();
    this.playback.track(this);
  }

  /** Masks show each ready artifact's rest render in place of the layer's static image. */
  protected applyMask() {
    const layers = [...this.layers];
    let changed = false;
    for (const state of this.plays) {
      if (state.slot.state !== "ready" || !state.slot.handle) continue;
      try {
        layers[state.play.layer] = `url("${state.slot.handle.url("rest")}")`;
        changed = true;
      } catch {
        // No object URLs on this host: the static image stays.
      }
    }
    if (changed) this.span.style.setProperty("mask-image", [...layers].reverse().join(", "));
  }

  /** (Re)builds the drawing: every layer in paint order, those with a ready live artifact as inline SVG. */
  protected build() {
    for (const state of this.plays) state.view = undefined;
    const ready = this.plays.filter((s) => s.slot.state === "ready" && s.slot.artifact?.status === "live");
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
    for (let i = 0; i < count; i++) {
      const state = ready.find((s) => s.play.layer === i);
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
      // The layer CSS paints, with its own size, position and repeat
      // (`layout` copies them from the span).
      const div = doc.createElement("div");
      this.statics.push({ div, layer: i });
      root.appendChild(div);
    }
    // The span's own background is drawn layer by layer inside the host now.
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

  protected liveView(state: PlayState, doc: Document): LiveView | undefined {
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
    const apertures = [...Array.from(outer.getElementsByTagNameNS(SVG_NS, "mask")), ...Array.from(outer.getElementsByTagNameNS(SVG_NS, "clipPath"))];
    for (const aperture of apertures) {
      const id = aperture.getAttribute("id");
      if (!id) continue;
      const paths = Array.from(aperture.children)
        .filter((child) => child.localName === "path")
        .map((element) => ({ element, d: element.getAttribute("d"), style: element.getAttribute("style") }));
      clips.push({ id: id.split(prefix).join(artifact.idPrefix), element: aperture, paths });
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
    return { box, artifact, prefix, parts, leaves, clips, gradients };
  }

  /**
   * Where CSS draws layer `cssIndex` (counted as the background lists count,
   * top first) in an area, or undefined for a layer a single inline drawing
   * cannot stand in for: one that repeats, or whose size or position this
   * cannot read. Such a layer keeps its static image.
   */
  protected placement(
    artifact: MorphArtifact,
    computed: CSSStyleDeclaration | undefined,
    cssIndex: number,
    area = { width: 100, height: 100 },
  ) {
    const value = (name: string) => (computed ? layerValue(computed.getPropertyValue(name), cssIndex) : "");
    const repeat = value("background-repeat");
    if (repeat && repeat !== "no-repeat" && repeat !== "no-repeat no-repeat") return undefined;
    return backgroundRect(area, svgIntrinsicSize(artifact), value("background-size") || "auto", value("background-position") || "0% 0%");
  }

  /** Places each live drawing where CSS would draw its static image. */
  layout() {
    if (!this.shadowHost) return;
    const computed = this.span.ownerDocument.defaultView?.getComputedStyle(this.span);
    const count = this.layers.length;
    // A style change can make a layer drawable live (`no-repeat`) or keep it
    // to CSS (`repeat`, a value this cannot read): draw it again either way.
    for (const state of this.plays) {
      const artifact = state.slot.state === "ready" ? state.slot.artifact : undefined;
      if (!artifact || artifact.status !== "live" || state.broken) continue;
      const eligible = !!this.placement(artifact, computed, count - 1 - state.play.layer);
      if (eligible !== !!state.view) {
        this.build();
        return;
      }
    }
    for (const { div, layer } of this.statics) {
      const style = `position:absolute;inset:0;background-image:${this.layers[layer]};${this.layerStyle(computed, count - 1 - layer)}`;
      if (div.getAttribute("style") !== style) div.setAttribute("style", style);
    }
    const area = positioningArea(this.span, computed);
    // A span with no size yet (its target hidden) is placed once it has one.
    if (!(area.width > 0 && area.height > 0)) return;
    for (const state of this.plays) {
      const view = state.view;
      if (!view) continue;
      const rect = this.placement(view.artifact, computed, count - 1 - state.play.layer, area);
      if (!rect) continue;
      // The svg root covers the span's box, as the static layer does, so the
      // browser snaps both to the same device pixels; each part then takes
      // the static image's exact fractional rectangle inside it.
      for (const part of view.parts) {
        part.setAttribute("x", String(rect.x));
        part.setAttribute("y", String(rect.y));
        part.setAttribute("width", String(rect.width));
        part.setAttribute("height", String(rect.height));
      }
    }
  }

  /** Poses each live drawing for the current time. */
  render() {
    if (this.frozen || this.disposed) return;
    for (const state of this.plays) {
      const view = state.view;
      if (!view || !state.occurrence) continue;
      const head = this.playback.playhead(state.occurrence);
      const at = "offset" in head ? head.offset : "rest";
      const signature = String(at);
      if (view.last === signature) continue;
      view.last = signature;
      const frame: MorphFrameState =
        at === "rest"
          ? {
              shown: new Set(),
              hidden: new Set(),
              geometry: new Map(),
              paint: new Map(),
              gradients: new Map(),
              opacity: new Map(),
              clips: new Map(),
              reaches: new Map(),
            }
          : morphFrameState(view.artifact, morphPosesAt(view.artifact, at));
      applyFrame(view, frame);
    }
  }

  /** Holds the frame shown now and lets go of the schedule: this layer is fading out. */
  freeze() {
    if (this.frozen || this.disposed) return;
    this.frozen = true;
    for (const state of this.plays) {
      if (state.occurrence) this.playback.letGo(state.occurrence);
      state.occurrence = undefined;
    }
  }

  dispose() {
    if (this.disposed) return;
    this.freeze();
    this.disposed = true;
    for (const state of this.plays) {
      state.slot.dispose();
      state.view = undefined;
    }
    this.playback.forget(this);
    delete (this.span as HTMLElement & { __sdMorph?: MorphLayer }).__sdMorph;
  }
}

/**
 * The span's background positioning area (its padding box) in fractional
 * pixels. `clientWidth` and `clientHeight` round to whole pixels, which puts
 * a drawing up to half a pixel off the image CSS draws; the computed size is
 * exact and, unlike a bounding rectangle, ignores the transforms an enter
 * animation plays on the span.
 */
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

/**
 * Makes a part's markup as inert as the image it replaces. Art drawn as a
 * CSS background image runs nothing; drawn inline in the page it could, so
 * scripts and embedded documents go, as do event handler attributes and
 * `javascript:` links.
 */
function inert(root: Element) {
  for (const element of [root, ...Array.from(root.querySelectorAll("*"))]) {
    if (EXECUTABLE.has(element.localName.toLowerCase())) {
      element.remove();
      continue;
    }
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const link = name === "href" || name.endsWith(":href") || name === "src";
      // A browser drops whitespace and control characters from a URL's
      // scheme (`java&#x09;script:` is `javascript:`), so they go before the
      // scheme is read.
      const scheme = [...attribute.value].filter((c) => c.charCodeAt(0) > 32 && c.charCodeAt(0) !== 127).join("");
      if (name.startsWith("on") || (link && /^javascript:/i.test(scheme))) {
        element.removeAttribute(attribute.name);
      }
    }
  }
}

/** Writes a frame into a live drawing, starting every element from its markup. */
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
    // A gradient copy the leaf paints with is named in the artifact's ids.
    const style = element.attributes["style"];
    write(leaf.element, "style", style === undefined ? null : namespaceMorphMarkup(style, view.artifact.idPrefix, view.prefix));
    write(leaf.element, "d", element.attributes["d"] ?? null);
  }
  for (const gradient of view.gradients) {
    // Each copy starts from its markup every frame.
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
  for (const clip of view.clips) {
    // Each aperture's paths start from their markup every frame.
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
    // The clip path bounding the reach is made the first time a frame needs
    // it, and stays, unreferenced, while the aperture rests.
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
