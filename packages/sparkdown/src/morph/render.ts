// A reference renderer for artifacts: the whole picture at one pose as a
// single SVG document. It states the playback rules a live player follows
// (README.md, "Playing an artifact") in executable form, and lets tests and
// verification captures look at any pose without a player.

import { untangle } from "@impower/spark-morph/src/apertures";
import type { Point } from "@impower/spark-morph/src/index";
import { parse, stringify, type Node } from "../txml/txml";
import { own, table } from "./own";
import { blendColor, formatColor, readAlpha } from "./color";
import { setStyleProperty, styleDeclaration } from "./svgDocument";
import type { MorphArtifact, MorphClipFrames, MorphColor, MorphFrames, MorphGeometryRef, MorphGradient, MorphGradientBlend, MorphPaint, MorphPaintBase, MorphPaintPose } from "./types";

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

const signedArea = (flat: number[]): number => {
  let twice = 0;
  for (let i = 0; i + 1 < flat.length; i += 2) {
    const j = (i + 2) % flat.length;
    twice += flat[i]! * flat[j + 1]! - flat[j]! * flat[i + 1]!;
  }
  return twice / 2;
};

/** A point at the precision path data is written with. */
const snap = ([x, y]: Point): Point => [Math.round(x * 1000) / 1000 || 0, Math.round(y * 1000) / 1000 || 0];

const reverseFlat = (flat: number[]): number[] => {
  const out: number[] = [];
  for (let k = flat.length - 2; k >= 0; k -= 2) out.push(flat[k]!, flat[k + 1]!);
  return out;
};

/**
 * How far, in screen pixels, an aperture reaches past its outline: far
 * enough that the outline's antialiased edge lies under the drawings around
 * the opening.
 */
export const APERTURE_REACH = 1;

/** The stroke an aperture mask's path reaches past its outline with, as style declarations. */
export const APERTURE_REACH_STROKE: readonly (readonly [string, string])[] = [
  ["stroke", "#fff"],
  ["stroke-opacity", "1"],
  ["stroke-width", `${APERTURE_REACH * 2}px`],
  ["stroke-dasharray", "none"],
  ["stroke-linejoin", "round"],
];

/**
 * Appended to an aperture's id to name the clip path that bounds its reach
 * (`poseAperture`). The bake gives an aperture an id only when this one is
 * free too.
 */
export const APERTURE_REACH_ID_SUFFIX = "-reach";

/** The style of the path that bounds an aperture's reach (`poseAperture`). */
export const APERTURE_REACH_CLIP_STYLE = "clip-rule:nonzero";

/** Where `progress` falls in a table of `count` samples: the sample before it, and how far on to the next. */
const samplePlace = (count: number, ref: MorphGeometryRef, progress: number) => {
  const t = clamp01(ref.reversed ? 1 - progress : progress);
  const u = t * (count - 1);
  const i = Math.min(count - 2, Math.floor(u));
  return { i, f: u - i };
};

/**
 * Blends one aperture table entry's loops at `progress`. Blending two
 * samples point by point can cross even where neither sample does: the bake
 * spaces each sample's points along its own outline, so point k of two
 * samples need not be the same place on the opening. Where the blend, as
 * written, crosses itself or passes through one of its own points, the part
 * winding the way the samples' opening does is kept (as the bake untangles
 * its samples), so every aperture drawn between two samples is a simple
 * loop. A progress that falls on a sample draws that sample as stored, so
 * the rest outline keeps the markup's path data and its reach.
 */
export function aperturePathData(samples: number[][][], ref: MorphGeometryRef, progress: number): string {
  return loopsPathData(apertureLoops(samples, ref, progress));
}

function apertureLoops(samples: number[][][], ref: MorphGeometryRef, progress: number): number[][] {
  const { i, f } = samplePlace(samples.length, ref, progress);
  const a = samples[i]!;
  const b = samples[i + 1] ?? a;
  return a.map((loop, j) => {
    const other = b[j] ?? loop;
    // The last sample is reached with `f` at 1, the others with it at 0.
    if (f === 0) return loop;
    if (f === 1) return other;
    const points: Point[] = [];
    for (let k = 0; k + 1 < loop.length; k += 2) {
      points.push(snap([loop[k]! + ((other[k] ?? loop[k]!) - loop[k]!) * f, loop[k + 1]! + ((other[k + 1] ?? loop[k + 1]!) - loop[k + 1]!) * f]));
    }
    // The wider sample says which way the opening winds; a closed one has
    // no area to tell.
    const area = Math.abs(signedArea(loop)) >= Math.abs(signedArea(other)) ? signedArea(loop) : signedArea(other);
    return untangle(points, Math.sign(area), { snap, throughPoints: true }).flat();
  });
}

/**
 * Path data for where an aperture may reach at `progress`, strictly between
 * a segment's ends: every loop of the aperture as `aperturePathData` blends
 * it, and around each loop in `reaching` the drawings of its two edges,
 * blended point by point between samples as the player blends the moving
 * drawings. Clipped to this, the reach stays under the edges: where an edge
 * tapers thinner than the reach, toward its tips, the reach ends at the
 * edge's far side rather than showing the targets past it, and a loop not
 * in `reaching` reaches nowhere. Every loop is wound the same way, so the
 * nonzero rule fills each, overlapping or not.
 */
export function apertureReachPathData(
  samples: number[][][],
  edges: number[][][][],
  ref: MorphGeometryRef,
  progress: number,
  reaching: readonly number[],
): string {
  const loops = apertureLoops(samples, ref, progress);
  const { i, f } = samplePlace(edges.length, ref, progress);
  const rings: number[][] = [];
  loops.forEach((loop, j) => {
    rings.push(loop);
    if (!reaching.includes(j)) return;
    const next = edges[i + 1]?.[j];
    (edges[i]?.[j] ?? []).forEach((band, k) => {
      const other = next?.[k];
      rings.push(f === 0 || !other ? band : band.map((v, n) => v + ((other[n] ?? v) - v) * f));
    });
  });
  return loopsPathData(rings.map((flat) => (signedArea(flat) < 0 ? reverseFlat(flat) : flat)));
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
  const own = readAlpha(inline?.value ?? element.attributes["opacity"] ?? "1");
  const value = fmt((own ?? 1) * factor);
  setStyleProperty(element, "opacity", inline?.important ? `${value} !important` : value);
};

/** The CSS values a moving drawing's recorded paint blends to at `progress`. */
export function paintAt(paint: MorphPaint, progress: number): Record<string, string> {
  const t = clamp01(progress);
  const out: Record<string, string> = table();
  for (const name of ["fill", "stroke"] as const) {
    const ends = paint[name];
    if (ends) out[name] = formatColor(blendColor(ends[0], ends[1], t));
  }
  for (const name of ["fill-opacity", "stroke-opacity", "opacity"] as const) {
    const ends = paint[name];
    if (ends) out[name] = fmt(ends[0] + (ends[1] - ends[0]) * t);
  }
  return out;
}

/**
 * Gradient numbers to ten significant digits, so a small transform
 * coefficient that places a gradient keeps its value rather than rounding to
 * a singular matrix.
 */
const fine = (n: number) => String(Number(n.toPrecision(10)) || 0);

const GEOMETRY_NAMES: Record<MorphGradient["kind"], string[]> = {
  linear: ["x1", "y1", "x2", "y2"],
  radial: ["cx", "cy", "r", "fx", "fy", "fr"],
};

/**
 * What a frame writes on a gradient copy: its coordinates and
 * `gradientTransform` as attributes, and each stop's `offset` and
 * `stop-color`, in order.
 */
export interface MorphGradientState {
  attributes: Record<string, string>;
  stops: { offset: string; "stop-color": string }[];
}

/** A gradient's coordinates, transform and stops, written as a copy carries them. */
export function gradientAttributes(gradient: MorphGradient): MorphGradientState {
  const attributes: Record<string, string> = table();
  GEOMETRY_NAMES[gradient.kind].forEach((name, i) => (attributes[name] = fine(gradient.geometry[i]!)));
  attributes["gradientTransform"] = `matrix(${gradient.transform.map(fine).join(" ")})`;
  return { attributes, stops: gradient.stops.map(([offset, color]) => ({ offset: fine(offset), "stop-color": formatColor(color) })) };
}

/**
 * A blended gradient at `progress`: coordinates, `gradientTransform` entry
 * by entry and stop offsets linearly, and stop colours as paint blends.
 */
export function gradientAt(blend: MorphGradientBlend, progress: number): MorphGradientState {
  const t = clamp01(progress);
  const [a, b] = blend.ends;
  // Weighted, rather than stepped from one end, so the difference of two
  // large ends of opposite sign never overflows.
  const lerp = (v: number, w: number) => v * (1 - t) + w * t;
  const mix = (x: number[], y: number[]) => x.map((v, i) => lerp(v, y[i]!));
  return gradientAttributes({
    ...a,
    geometry: mix(a.geometry, b.geometry),
    transform: mix(a.transform, b.transform),
    stops: a.stops.map(([offset, color], i) => [lerp(offset, b.stops[i]![0]), blendColor(color, b.stops[i]![1], t)]),
  });
}

/** Poses a gradient copy, given as it is written in its part, with a frame's values. */
export function poseGradient(element: Element, state: MorphGradientState) {
  Object.assign(element.attributes, state.attributes);
  elementsOf(element.children)
    .filter((child) => child.tagName === "stop")
    .forEach((stop, i) => {
      const values = state.stops[i];
      if (values) Object.assign(stop.attributes, values);
    });
}

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
 * leaf's `d`, the paint a moving leaf is drawn with, the factor a fading
 * leaf's own opacity is multiplied by, the path data of each aperture
 * and of where it may reach (`apertureReachPathData`), both by the
 * aperture's id before occurrence namespacing, and the values of each
 * gradient copy a moving leaf paints with, by the copy's id before
 * occurrence namespacing. Anything a frame does not mention keeps its markup.
 */
export interface MorphFrameState {
  shown: Set<string>;
  hidden: Set<string>;
  geometry: Map<string, string>;
  /**
   * CSS values by property, written inline over the leaf's own. A leaf
   * painting with a gradient copy takes `url(#id)`, the id before occurrence
   * namespacing.
   */
  paint: Map<string, Record<string, string>>;
  gradients: Map<string, MorphGradientState>;
  opacity: Map<string, number>;
  clips: Map<string, string>;
  reaches: Map<string, string>;
}

/** The playback rules applied to one pose of every driven group. */
export function morphFrameState(artifact: MorphArtifact, poses: Readonly<Record<string, MorphGroupPose>>): MorphFrameState {
  const state: MorphFrameState = {
    shown: new Set(),
    hidden: new Set(),
    geometry: new Map(),
    paint: new Map(),
    gradients: new Map(),
    opacity: new Map(),
    clips: new Map(),
    reaches: new Map(),
  };
  const { shown, hidden, geometry, opacity } = state;
  const show = (node: string | undefined) => {
    if (!node) return;
    hidden.delete(node);
    shown.add(node);
  };
  const showShapes = (carried: Record<string, string> | undefined) => {
    for (const [node, d] of Object.entries(carried ?? {})) {
      show(node);
      geometry.set(node, d);
    }
  };
  const writeClip = (clip: number, loops: MorphGeometryRef, p: number, reachable: MorphClipFrames["reach"] = []) => {
    const samples = artifact.apertures[loops.index]!;
    const edges = artifact.apertureEdges[loops.index];
    const d = aperturePathData(samples, loops, p);
    // The edges' moving drawings are drawn strictly between a segment's
    // ends, and hide a reach only past the loops whose edges paint above a
    // target (the segment's `reach`). At either end the poses' own drawings
    // take over, and a closed state's may paint beneath the targets, so there
    // the aperture has no reach (a rest outline keeps its markup's).
    const moving = !!edges && p > 0 && p < 1;
    const byLoops = new Map<string, string>();
    for (const target of artifact.clipTargets) {
      if (target.clip !== clip) continue;
      state.clips.set(target.aperture, d);
      const reaching = moving ? reachable.find((entry) => entry.aperture === target.aperture)?.loops : undefined;
      if (!reaching?.length) continue;
      const key = reaching.join(",");
      if (!byLoops.has(key)) byLoops.set(key, apertureReachPathData(samples, edges!, loops, p, reaching));
      state.reaches.set(target.aperture, byLoops.get(key)!);
    }
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
      if (last !== undefined) {
        holdApertures(artifact, group, last + 1, writeClip);
        showShapes(artifact.segments[last]?.carry?.to);
      }
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
          const values = t.paint ? paintAt(t.paint, p) : table<string>();
          for (const name of ["fill", "stroke"] as const) {
            const gradient = t.gradients?.[name];
            if (!gradient) continue;
            values[name] = `url(#${gradient.id})`;
            state.gradients.set(gradient.id, gradientAt(gradient, p));
          }
          if (Object.keys(values).length) state.paint.set(t.draw, values);
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
    for (const [node, d] of Object.entries(segment.shapes ?? {})) {
      if (p <= 0 || p >= 1) {
        shown.delete(node);
        hidden.add(node);
      } else if (shown.has(node) && !geometry.has(node)) {
        geometry.set(node, d);
      }
    }
    if (p <= 0) showShapes(segment.carry?.from);
    if (p >= 1) showShapes(segment.carry?.to);
    // The group's earlier segments leave their apertures at their end pose;
    // this segment's own apertures follow it.
    holdApertures(artifact, group, pose.segment, writeClip);
    for (const clip of segment.clips) writeClip(clip.clip, clip.loops, p, clip.reach);
  }
  // Later entries write over earlier ones.
  for (const entry of artifact.paints ?? []) paintPose(artifact, entry, own(poses, entry.group), state);
  return state;
}

/**
 * Writes a `paints` entry's colour for one pose of its group. While the
 * group holds the entry's pose, the pose's target drawings take the colour.
 * In a segment arriving at the pose the colour moves in over the segment's
 * last `span` with weight `w = clamp((p - (1 - span)) / span)`, mixed over
 * the paint each drawing shows without the entry, and a segment leaving the
 * pose mirrors it: tracks with an end among the pose's drawings and target
 * drawings both poses show take the mix, and a pose drawing showing as itself
 * (a segment's end, a fade, a cut or a scale) takes the colour. A drawing
 * whose own paint the bake could not read takes the colour only at full
 * weight.
 */
function paintPose(artifact: MorphArtifact, entry: MorphPaintPose, pose: MorphGroupPose | undefined, state: MorphFrameState) {
  if (!pose) return;
  const colors: ["fill" | "stroke", MorphColor][] = [];
  if (entry.fill) colors.push(["fill", entry.fill]);
  if (entry.stroke) colors.push(["stroke", entry.stroke]);
  // A drawing the frame hides keeps its markup. A target no driven group
  // switches is in neither set and always shows.
  const write = (node: string, base: MorphPaintBase | undefined, w: number) => {
    if (w <= 0 || state.hidden.has(node)) return;
    const values = state.paint.get(node) ?? table();
    for (const [name, color] of colors) {
      const own = base?.[name];
      if (w >= 1 || own) values[name] = formatColor(w >= 1 || !own ? color : blendColor(own, color, w));
    }
    if (entry.opacity !== undefined && (w >= 1 || base?.opacity !== undefined)) {
      const own = w >= 1 ? entry.opacity : base!.opacity!;
      values["opacity"] = fmt(own + (entry.opacity - own) * w);
    }
    if (Object.keys(values).length) state.paint.set(node, values);
  };
  if ("state" in pose) {
    if (pose.state !== entry.state) return;
    for (const node of Object.keys(entry.nodes)) write(node, undefined, 1);
    return;
  }
  const segment = artifact.segments[pose.segment];
  if (!segment || segment.group !== entry.group) return;
  const arriving = segment.to.state === entry.state;
  const leaving = segment.from.state === entry.state;
  if (!arriving && !leaving) return;
  const p = clamp01(pose.progress);
  const ramp = (q: number) => (entry.span > 0 ? clamp01((q - (1 - entry.span)) / entry.span) : q >= 1 ? 1 : 0);
  const w = arriving && leaving ? 1 : arriving ? ramp(p) : ramp(1 - p);
  const states = own(artifact.visibility, entry.group) ?? {};
  const before = new Set(own(states, segment.from.state) ?? []);
  const after = new Set(own(states, segment.to.state) ?? []);
  const switched = new Set(Object.values(states).flat());
  // The nodes moving shapes draw on this frame show the track, not their drawing.
  const drawing = new Set(p > 0 && p < 1 ? segment.transitions.flatMap((t) => (t.kind === "morph" || t.kind === "scale" ? [t.draw] : [])) : []);
  for (const [node, base] of Object.entries(entry.nodes)) {
    if (drawing.has(node)) continue;
    // A drawing both poses show, the group's own or one it never switches,
    // takes the mix; one the pose alone shows is the pose's drawing itself.
    const both = !switched.has(node) || (before.has(node) && after.has(node));
    write(node, base, both ? w : 1);
  }
  for (const t of segment.transitions) {
    if (t.kind === "scale" && t.node in entry.nodes && drawing.has(t.draw)) write(t.draw, undefined, 1);
  }
  if (p <= 0 || p >= 1) return;
  for (const track of entry.tracks) {
    if (track.segment !== pose.segment) continue;
    const base: MorphPaintBase = {};
    for (const [name] of colors) {
      const ends = track.ends[name];
      if (ends) base[name] = blendColor(ends[0], ends[1], p);
    }
    const opacity = track.ends.opacity;
    if (opacity) base.opacity = opacity[0] + (opacity[1] - opacity[0]) * p;
    write(track.draw, base, w);
  }
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
  // Paint is written where it takes effect, as a fade's opacity is.
  for (const [name, value] of Object.entries(state.paint.get(node) ?? {})) {
    setStyleProperty(element, name, styleDeclaration(element, name)?.important ? `${value} !important` : value);
  }
  const o = state.opacity.get(node);
  if (o !== undefined) multiplyOpacity(element, o);
}

/**
 * Poses an aperture (a mask or clip path, given as it is written in its
 * part: its first path the rest outline, a mask's open loops stroked to
 * reach past it) with the path data a frame gives it, `d`, and where it may
 * reach, `reach` (`apertureReachPathData`). At the rest outline it keeps its
 * markup. Away from it every path draws the frame's aperture, and a mask's
 * first path also reaches past it, clipped to `reach` by a clip path the
 * mask holds (its id with `APERTURE_REACH_ID_SUFFIX`), whose id and path
 * data it returns. A clip path, or a mask given no `reach`, draws the
 * aperture's area alone. The clip and
 * its rule are inline (`APERTURE_REACH_CLIP_STYLE`): a clip path's content
 * inherits `clip-rule` from the artwork root, and exported art often sets it
 * to `evenodd` there, under which the overlapping loops of `reach` would
 * cancel.
 */
export function poseAperture(aperture: Element, d: string, reach?: string): { id: string; d: string } | undefined {
  const paths = elementsOf(aperture.children).filter((child) => child.tagName === "path");
  if (!paths.length || paths[0]!.attributes["d"] === d) return undefined;
  for (const path of paths) {
    path.attributes["d"] = d;
    setStyleProperty(path, "stroke", "none");
  }
  if (aperture.tagName !== "mask" || reach === undefined) return undefined;
  const id = `${aperture.attributes["id"] ?? ""}${APERTURE_REACH_ID_SUFFIX}`;
  const bound: Element = {
    tagName: "clipPath",
    attributes: { id, clipPathUnits: "userSpaceOnUse" },
    children: [{ tagName: "path", attributes: { style: APERTURE_REACH_CLIP_STYLE, d: reach }, children: [] }],
  };
  const at = elementsOf(aperture.children).find((child) => child.tagName === "clipPath" && child.attributes["id"] === id);
  if (at) aperture.children[aperture.children.indexOf(at)] = bound;
  else aperture.children.push(bound);
  const first = paths[0]!;
  for (const [name, value] of APERTURE_REACH_STROKE) setStyleProperty(first, name, value);
  setStyleProperty(first, "clip-path", `url(#${id})`);
  return { id, d: reach };
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
        const gradient = element.tagName.endsWith("Gradient") ? state.gradients.get(element.attributes["id"] ?? "") : undefined;
        if (gradient) poseGradient(element, gradient);
        if (element.tagName === "mask" || element.tagName === "clipPath") {
          const id = element.attributes["id"] ?? "";
          const d = clipData.get(id);
          if (d !== undefined) poseAperture(element, d, state.reaches.get(id));
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
