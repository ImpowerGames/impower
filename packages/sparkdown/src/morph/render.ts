// A reference renderer for artifacts: the whole picture at one pose as a
// single SVG document. It states the playback rules a live player follows
// (README.md, "Playing an artifact") in executable form, and lets tests and
// verification captures look at any pose without a player.

import { parse, stringify, type Node } from "../txml/txml";
import { own, table } from "./own";
import { setStyleProperty, styleDeclaration } from "./svgDocument";
import type { MorphArtifact, MorphFrames, MorphGeometryRef } from "./types";

type Element = Exclude<Node, string | null>;

/**
 * Where the picture is: at rest, or partway through one segment with the
 * progress already shaped by the morph's timing.
 */
export type MorphPose = { segment: number; progress: number } | "rest";

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

/** The sample blend `interpolateSamples` performs, honouring `reversed`. */
export function sampleAt(samples: number[][], ref: Pick<MorphGeometryRef, "reversed">, progress: number): number[] {
  const t = clamp01(ref.reversed ? 1 - progress : progress);
  const u = t * (samples.length - 1);
  const i = Math.min(samples.length - 2, Math.floor(u));
  const f = u - i;
  const a = samples[i]!;
  const b = samples[i + 1] ?? a;
  if (f === 0) return a;
  return a.map((v, k) => v + (b[k]! - v) * f);
}

const fmt = (n: number) => String(Math.round(n * 1000) / 1000 || 0);

/** Path data for one frame of a frames entry. */
export function framePathData(frames: MorphFrames, values: number[]): string {
  let d = "";
  let k = 0;
  frames.segmentCounts.forEach((count, si) => {
    if (!count) return;
    if (frames.lines) {
      d += `M${fmt(values[k]!)},${fmt(values[k + 1]!)}`;
      for (let i = 1; i < count; i++) d += `L${fmt(values[k + 2 * i]!)},${fmt(values[k + 2 * i + 1]!)}`;
      d += "Z";
      k += 2 * count;
      return;
    }
    d += `M${fmt(values[k]!)},${fmt(values[k + 1]!)}`;
    for (let i = 0; i < count; i++) {
      const o = k + 8 * i;
      d += `C${fmt(values[o + 2]!)},${fmt(values[o + 3]!)} ${fmt(values[o + 4]!)},${fmt(values[o + 5]!)} ${fmt(values[o + 6]!)},${fmt(values[o + 7]!)}`;
    }
    if (frames.closed[si]) d += "Z";
    k += 8 * count;
  });
  return d;
}

const loopsPathData = (loops: number[][]) =>
  loops
    .map((flat) => {
      if (flat.length < 2) return "";
      let d = `M${fmt(flat[0]!)},${fmt(flat[1]!)}`;
      for (let i = 2; i + 1 < flat.length; i += 2) d += `L${fmt(flat[i]!)},${fmt(flat[i + 1]!)}`;
      return `${d}Z`;
    })
    .join("");

/** Blends one aperture table entry's loops at `progress`. */
export function aperturePathData(samples: number[][][], ref: MorphGeometryRef, progress: number): string {
  const t = clamp01(ref.reversed ? 1 - progress : progress);
  const u = t * (samples.length - 1);
  const i = Math.min(samples.length - 2, Math.floor(u));
  const f = u - i;
  const a = samples[i]!;
  const b = samples[i + 1] ?? a;
  return loopsPathData(a.map((loop, j) => (f === 0 ? loop : loop.map((v, k) => v + ((b[j]?.[k] ?? v) - v) * f))));
}

/**
 * Replaces the artifact's id prefix with a per-copy one, so several inline
 * copies of the same part on one page keep their resources apart.
 */
export const namespaceMorphMarkup = (svg: string, idPrefix: string, occurrencePrefix: string): string =>
  svg.split(idPrefix).join(occurrencePrefix);

const elementsOf = (children: Node[]) => children.filter((c): c is Element => !!c && typeof c === "object");

function* walk(element: Element): Generator<Element> {
  yield element;
  for (const child of elementsOf(element.children)) yield* walk(child);
}

/**
 * Fades a drawing from its own opacity. An inline `style` opacity outranks the
 * attribute, so the authored value is read from where it takes effect and the
 * faded one is written where it will.
 */
const multiplyOpacity = (element: Element, factor: number) => {
  const inline = styleDeclaration(element, "opacity");
  const own = Number.parseFloat(inline?.value ?? element.attributes["opacity"] ?? "1");
  const value = fmt((Number.isFinite(own) ? own : 1) * factor);
  setStyleProperty(element, "opacity", inline?.important ? `${value} !important` : value);
};

/**
 * Where one driven group is: holding a state, or partway through one of the
 * artifact's segments. A held group names the last of its segments it has
 * finished, if any, so its apertures keep that segment's end pose.
 */
export type MorphGroupPose = { state: string; last?: number } | { segment: number; progress: number };

/**
 * Every driven group's pose at keyframe offset `offset`, which is already
 * eased: the segment the offset falls in, or the state the group holds
 * there.
 */
export function morphPosesAt(artifact: MorphArtifact, offset: number): Record<string, MorphGroupPose> {
  const at = clamp01(offset);
  const poses: Record<string, MorphGroupPose> = table();
  for (const [group, entries] of Object.entries(artifact.schedules)) {
    let last: number | undefined;
    let pose: MorphGroupPose | undefined;
    // A group's segments are in schedule order. An offset exactly on a
    // segment's end is inside it, at its destination's pose.
    for (const [index, segment] of artifact.segments.entries()) {
      if (segment.group !== group) continue;
      if (at > segment.to.offset) {
        last = index;
        continue;
      }
      if (segment.from.offset <= at) {
        const span = segment.to.offset - segment.from.offset;
        pose = { segment: index, progress: span > 0 ? (at - segment.from.offset) / span : 1 };
      }
      break;
    }
    if (!pose) {
      const held = entries.filter((e) => e.offset <= at).pop() ?? entries[0];
      pose = { state: held?.state ?? "", ...(last === undefined ? {} : { last }) };
    }
    poses[group] = pose;
  }
  return poses;
}

/**
 * What a frame changes in the live parts as written: which leaves show and
 * hide through their inline `display`, the path data that replaces a moving
 * leaf's `d`, the factor a fading leaf's own opacity is multiplied by, and
 * the path data of each aperture (by its id before occurrence namespacing).
 * Anything a frame does not mention keeps its markup.
 */
export interface MorphFrameState {
  shown: Set<string>;
  hidden: Set<string>;
  geometry: Map<string, string>;
  opacity: Map<string, number>;
  clips: Map<string, string>;
}

/** The playback rules applied to one pose of every driven group. */
export function morphFrameState(artifact: MorphArtifact, poses: Readonly<Record<string, MorphGroupPose>>): MorphFrameState {
  const state: MorphFrameState = {
    shown: new Set(),
    hidden: new Set(),
    geometry: new Map(),
    opacity: new Map(),
    clips: new Map(),
  };
  const { shown, hidden, geometry, opacity } = state;
  const show = (node: string | undefined) => {
    if (!node) return;
    hidden.delete(node);
    shown.add(node);
  };
  const writeClip = (clip: number, loops: MorphGeometryRef, p: number) => {
    const d = aperturePathData(artifact.apertures[loops.index]!, loops, p);
    for (const target of artifact.clipTargets) if (target.clip === clip) state.clips.set(target.aperture, d);
  };
  for (const [group, states] of Object.entries(artifact.visibility)) {
    const pose = own(poses, group);
    const segment = pose && "segment" in pose ? artifact.segments[pose.segment] : undefined;
    // A group with no segment under way holds a state: its leaves in that
    // state show and its others hide.
    if (!segment || !pose || !("segment" in pose)) {
      const held = pose && "state" in pose ? pose.state : own(artifact.schedules, group)?.[0]?.state;
      const all = new Set(Object.values(states).flat());
      for (const node of all) (own(states, held ?? "")?.includes(node) ? shown : hidden).add(node);
      const last = pose && "state" in pose ? pose.last : undefined;
      if (last !== undefined) holdApertures(artifact, group, last + 1, writeClip);
      continue;
    }
    const p = clamp01(pose.progress);
    const before = new Set(own(states, segment.from.state) ?? []);
    const after = new Set(own(states, segment.to.state) ?? []);
    // Every drawing of the moving group starts hidden, including those of
    // states this segment does not touch (the open pose during `half →
    // closed`); drawings in both poses stay, and the transitions below
    // decide the rest.
    for (const node of new Set(Object.values(states).flat())) {
      (before.has(node) && after.has(node) ? shown : hidden).add(node);
    }
    for (const t of segment.transitions) {
      switch (t.kind) {
        case "morph": {
          // At the endpoint the destination's own drawing takes over, so a
          // destination several tracks share is drawn once.
          if (p >= 1) {
            show(t.to);
            break;
          }
          // The start pose is the authored drawing itself, not its sampled
          // approximation.
          if (p <= 0) {
            show(t.from);
            break;
          }
          show(t.draw);
          const frames = artifact.frames[t.frames.index]!;
          geometry.set(t.draw, framePathData(frames, sampleAt(frames.frames, t.frames, p)));
          break;
        }
        case "fade":
          if (t.from && p < 1) {
            show(t.from);
            opacity.set(t.from, 1 - p);
          }
          if (t.to && p > 0) {
            show(t.to);
            opacity.set(t.to, p);
          }
          break;
        case "cut":
          if (p < 1) show(t.from);
          else show(t.to);
          break;
        case "scale": {
          const zero = t.direction === "shrink" ? p >= 1 : p <= 0;
          if (zero) break;
          // The full endpoint is the authored drawing itself.
          const full = t.direction === "shrink" ? p <= 0 : p >= 1;
          if (full) {
            show(t.node);
            break;
          }
          show(t.draw);
          const frames = artifact.frames[t.frames.index]!;
          geometry.set(t.draw, framePathData(frames, sampleAt(frames.frames, t.frames, p)));
          break;
        }
        case "hold":
          show(t.node);
          break;
      }
    }
    // The group's earlier segments leave their apertures at their end pose;
    // this segment's own apertures follow it.
    holdApertures(artifact, group, pose.segment, writeClip);
    for (const clip of segment.clips) writeClip(clip.clip, clip.loops, p);
  }
  return state;
}

/**
 * Writes, for every clip a group's segments before `end` moved, the end pose
 * of the last of them that moved it: outside its segments an aperture keeps
 * its last pose.
 */
function holdApertures(
  artifact: MorphArtifact,
  group: string,
  end: number,
  writeClip: (clip: number, loops: MorphGeometryRef, p: number) => void,
) {
  const latest = new Map<number, MorphGeometryRef>();
  for (let i = 0; i < end && i < artifact.segments.length; i++) {
    const segment = artifact.segments[i]!;
    if (segment.group !== group) continue;
    for (const clip of segment.clips) latest.set(clip.clip, clip.loops);
  }
  for (const [clip, loops] of latest) writeClip(clip, loops, 1);
}

/**
 * The artifact drawn at `pose` as one SVG: each part nested in paint order,
 * the live parts posed. Groups other than the moving one hold their
 * schedule's first state. A static artifact draws its rest render.
 */
export function renderMorphFrame(artifact: MorphArtifact, pose: MorphPose): string {
  if (artifact.status !== "live" || pose === "rest") return artifact.rest;
  const segment = artifact.segments[pose.segment];
  if (!segment) return artifact.rest;
  const poses: Record<string, MorphGroupPose> = table();
  for (const group of Object.keys(artifact.visibility)) {
    poses[group] = group === segment.group ? pose : { state: own(artifact.schedules, group)?.[0]?.state ?? "" };
  }
  return renderMorphState(artifact, morphFrameState(artifact, poses));
}

/** The artifact drawn at keyframe offset `offset` (already eased) as one SVG. */
export function renderMorphAt(artifact: MorphArtifact, offset: number): string {
  if (artifact.status !== "live") return artifact.rest;
  return renderMorphState(artifact, morphFrameState(artifact, morphPosesAt(artifact, offset)));
}

/**
 * Poses one live leaf, given as it is written in its part (its markup
 * `style` and `d`), for the frame `state` describes. A player keeps each
 * leaf's markup and poses a copy of it every frame, so a leaf a frame no
 * longer mentions goes back to its markup.
 */
export function poseLeaf(element: Element, node: string, state: MorphFrameState) {
  // The inline declaration the live part is written with.
  if (state.shown.has(node)) setStyleProperty(element, "display", undefined);
  else if (state.hidden.has(node)) setStyleProperty(element, "display", "none");
  const d = state.geometry.get(node);
  if (d !== undefined) element.attributes["d"] = d;
  const o = state.opacity.get(node);
  if (o !== undefined) multiplyOpacity(element, o);
}

/**
 * Poses an aperture (a mask or clip path, given as it is written in its
 * part: its first path the rest outline, a mask's open loops stroked to
 * reach past it) with the path data a frame gives it. At the rest outline
 * it keeps its markup. Away from it every path draws the frame's aperture
 * without reach (see the bake's aperture masks).
 */
export function poseAperture(aperture: Element, d: string) {
  const paths = elementsOf(aperture.children).filter((child) => child.tagName === "path");
  if (!paths.length || paths[0]!.attributes["d"] === d) return;
  for (const path of paths) {
    path.attributes["d"] = d;
    setStyleProperty(path, "stroke", "none");
  }
}

function renderMorphState(artifact: MorphArtifact, state: MorphFrameState): string {
  const clipData = state.clips;
  const root: Element = {
    tagName: "svg",
    attributes: {
      xmlns: "http://www.w3.org/2000/svg",
      ...(artifact.viewBox ? { viewBox: artifact.viewBox } : {}),
      ...(artifact.width ? { width: artifact.width } : {}),
      ...(artifact.height ? { height: artifact.height } : {}),
    },
    children: [],
  };
  for (const part of artifact.parts) {
    const doc = parse(part.svg);
    const svg = elementsOf(Array.isArray(doc) ? doc : [doc]).find((e) => e.tagName === "svg");
    if (!svg) continue;
    if (part.kind === "live") {
      for (const element of walk(svg)) {
        const node = element.attributes["data-morph"];
        if (node !== undefined) poseLeaf(element, node, state);
        if (element.tagName === "mask" || element.tagName === "clipPath") {
          const d = clipData.get(element.attributes["id"] ?? "");
          if (d !== undefined) poseAperture(element, d);
        }
      }
    }
    // Each part fills the outer picture's viewport, as each would fill the
    // same box drawn on its own.
    svg.attributes["x"] = "0";
    svg.attributes["y"] = "0";
    svg.attributes["width"] = "100%";
    svg.attributes["height"] = "100%";
    root.children.push(svg);
  }
  return stringify([root], { quote: "'", selfClosingTags: ["path"] });
}
