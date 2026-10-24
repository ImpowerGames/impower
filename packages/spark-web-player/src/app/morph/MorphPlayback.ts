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
  morphFrameState,
  morphPosesAt,
  namespaceMorphMarkup,
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
  leaves: { element: Element; node: string; style: string | null; d: string | null; opacity: string | null }[];
  clips: { path: Element; id: string; d: string | null }[];
  /** The pose last written, so an unchanged frame writes nothing. */
  last?: string;
}

interface PlayState {
  play: MorphLayerPlay;
  slot: MorphArtifactSlot;
  occurrence?: Occurrence;
  view?: LiveView;
}

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
    this.host = options.host ?? defaultHost();
    this.seed = options.seed ?? "";
    this.requestFrame = options.requestFrame ?? ((cb) => (view ?? window).requestAnimationFrame(cb));
    this.cancelFrame = options.cancelFrame ?? ((h) => (view ?? window).cancelAnimationFrame(h));
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

function defaultHost(): MorphHost {
  const service = new MorphBakeService({
    ...(typeof URL.createObjectURL === "function"
      ? { createObjectURL: (blob: Blob) => URL.createObjectURL(blob), revokeObjectURL: (url: string) => URL.revokeObjectURL(url) }
      : {}),
  });
  // Artifacts come from the asset service that serves the art (the web
  // editor's service worker). A reference without one names art the page
  // holds no source for, and stays static.
  return createMorphHost({ service, channel: () => undefined, fetch: (url, init) => fetch(url, init) });
}

/** The morphs of one written image layer (an `instance` span). */
export class MorphLayer {
  protected plays: PlayState[] = [];
  protected frozen = false;
  protected disposed = false;
  protected shadowHost?: HTMLElement;

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
    const computed = doc.defaultView?.getComputedStyle(this.span);
    const count = this.layers.length;
    for (let i = 0; i < count; i++) {
      const state = ready.find((s) => s.play.layer === i);
      const view = state && this.placement(state.slot.artifact!, computed, count - 1 - i) ? this.liveView(state, doc) : undefined;
      if (state && view) {
        state.view = view;
        root.appendChild(view.box);
        continue;
      }
      // The layer CSS paints, with its own size, position and repeat.
      const div = doc.createElement("div");
      const css = this.layerStyle(computed, count - 1 - i);
      div.setAttribute("style", `position:absolute;inset:0;background-image:${this.layers[i]};${css}`);
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
    const NS = "http://www.w3.org/2000/svg";
    const outer = doc.createElementNS(NS, "svg");
    outer.setAttribute("width", "100%");
    outer.setAttribute("height", "100%");
    outer.setAttribute("style", "position:absolute;inset:0;overflow:visible");
    const parser = new (doc.defaultView?.DOMParser ?? DOMParser)();
    for (const part of artifact.parts) {
      const parsed = parser.parseFromString(namespaceMorphMarkup(part.svg, artifact.idPrefix, prefix), "image/svg+xml");
      const svg = parsed.documentElement;
      if (!svg || svg.localName !== "svg" || parsed.getElementsByTagName("parsererror").length) return undefined;
      const node = doc.importNode(svg, true);
      node.setAttribute("x", "0");
      node.setAttribute("y", "0");
      node.setAttribute("width", "100%");
      node.setAttribute("height", "100%");
      outer.appendChild(node);
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
    for (const clipPath of Array.from(outer.getElementsByTagNameNS(NS, "clipPath"))) {
      const path = clipPath.firstElementChild;
      const id = clipPath.getAttribute("id");
      if (!path || !id) continue;
      clips.push({ path, id: id.split(prefix).join(artifact.idPrefix), d: path.getAttribute("d") });
    }
    return { box, artifact, prefix, leaves, clips };
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
    const area = positioningArea(this.span, computed);
    // A span with no size yet (its target hidden) is placed once it has one.
    if (!(area.width > 0 && area.height > 0)) return;
    const count = this.layers.length;
    for (const state of this.plays) {
      const view = state.view;
      if (!view) continue;
      const rect = this.placement(view.artifact, computed, count - 1 - state.play.layer, area);
      if (!rect) continue;
      // The browser paints a background image on whole device pixels; a
      // drawing placed on the same snapped rectangle lands on its pixels.
      const dpr = this.span.ownerDocument.defaultView?.devicePixelRatio || 1;
      const snap = (v: number) => `${Math.round(v * dpr) / dpr}px`;
      view.box.style.left = snap(rect.x);
      view.box.style.top = snap(rect.y);
      view.box.style.width = snap(rect.width);
      view.box.style.height = snap(rect.height);
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
          ? { shown: new Set(), hidden: new Set(), geometry: new Map(), opacity: new Map(), clips: new Map() }
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
    write(leaf.element, "style", element.attributes["style"] ?? null);
    write(leaf.element, "d", element.attributes["d"] ?? null);
  }
  for (const clip of view.clips) write(clip.path, "d", frame.clips.get(clip.id) ?? clip.d);
}

function write(element: Element, name: string, value: string | null) {
  if (element.getAttribute(name) === value) return;
  if (value === null) element.removeAttribute(name);
  else element.setAttribute(name, value);
}
