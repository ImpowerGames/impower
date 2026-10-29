import { untangle } from "@impower/spark-morph/src/apertures";
import type { Point } from "@impower/spark-morph/src/index";
import { parse, stringify, type Node } from "../txml/txml";
import { own, table } from "./own";
import { blendColor, formatColor, readAlpha } from "./color";
import { setStyleProperty, styleDeclaration } from "./svgDocument";
import type { MorphArtifact, MorphClipFrames, MorphColor, MorphFrames, MorphGeometryRef, MorphGradient, MorphGradientBlend, MorphPaint, MorphPaintBase, MorphPaintPose } from "./types";

type Element = Exclude<Node, string | null>;

export type MorphPose = { segment: number; progress: number } | "rest";

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

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

const snap = ([x, y]: Point): Point => [Math.round(x * 1000) / 1000 || 0, Math.round(y * 1000) / 1000 || 0];

const reverseFlat = (flat: number[]): number[] => {
  const out: number[] = [];
  for (let k = flat.length - 2; k >= 0; k -= 2) out.push(flat[k]!, flat[k + 1]!);
  return out;
};

export const APERTURE_REACH = 1;

export const APERTURE_REACH_STROKE: readonly (readonly [string, string])[] = [
  ["stroke", "#fff"],
  ["stroke-opacity", "1"],
  ["stroke-width", `${APERTURE_REACH * 2}px`],
  ["stroke-dasharray", "none"],
  ["stroke-linejoin", "round"],
];

export const APERTURE_REACH_ID_SUFFIX = "-reach";

export const APERTURE_REACH_CLIP_STYLE = "clip-rule:nonzero";

const samplePlace = (count: number, ref: MorphGeometryRef, progress: number) => {
  const t = clamp01(ref.reversed ? 1 - progress : progress);
  const u = t * (count - 1);
  const i = Math.min(count - 2, Math.floor(u));
  return { i, f: u - i };
};

export function aperturePathData(samples: number[][][], ref: MorphGeometryRef, progress: number): string {
  return loopsPathData(apertureLoops(samples, ref, progress));
}

function apertureLoops(samples: number[][][], ref: MorphGeometryRef, progress: number): number[][] {
  const { i, f } = samplePlace(samples.length, ref, progress);
  const a = samples[i]!;
  const b = samples[i + 1] ?? a;
  return a.map((loop, j) => {
    const other = b[j] ?? loop;
    if (f === 0) return loop;
    if (f === 1) return other;
    const points: Point[] = [];
    for (let k = 0; k + 1 < loop.length; k += 2) {
      points.push(snap([loop[k]! + ((other[k] ?? loop[k]!) - loop[k]!) * f, loop[k + 1]! + ((other[k + 1] ?? loop[k + 1]!) - loop[k + 1]!) * f]));
    }
    const area = Math.abs(signedArea(loop)) >= Math.abs(signedArea(other)) ? signedArea(loop) : signedArea(other);
    return untangle(points, Math.sign(area), { snap, throughPoints: true }).flat();
  });
}

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

export const namespaceMorphMarkup = (svg: string, idPrefix: string, occurrencePrefix: string): string =>
  svg.split(idPrefix).join(occurrencePrefix);

const elementsOf = (children: Node[]) => children.filter((c): c is Element => !!c && typeof c === "object");

function* walk(element: Element): Generator<Element> {
  yield element;
  for (const child of elementsOf(element.children)) yield* walk(child);
}

const multiplyOpacity = (element: Element, factor: number) => {
  const inline = styleDeclaration(element, "opacity");
  const own = readAlpha(inline?.value ?? element.attributes["opacity"] ?? "1");
  const value = fmt((own ?? 1) * factor);
  setStyleProperty(element, "opacity", inline?.important ? `${value} !important` : value);
};

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

const fine = (n: number) => String(Number(n.toPrecision(10)) || 0);

const GEOMETRY_NAMES: Record<MorphGradient["kind"], string[]> = {
  linear: ["x1", "y1", "x2", "y2"],
  radial: ["cx", "cy", "r", "fx", "fy", "fr"],
};

export interface MorphGradientState {
  attributes: Record<string, string>;
  stops: { offset: string; "stop-color": string }[];
}

export function gradientAttributes(gradient: MorphGradient): MorphGradientState {
  const attributes: Record<string, string> = table();
  GEOMETRY_NAMES[gradient.kind].forEach((name, i) => (attributes[name] = fine(gradient.geometry[i]!)));
  attributes["gradientTransform"] = `matrix(${gradient.transform.map(fine).join(" ")})`;
  return { attributes, stops: gradient.stops.map(([offset, color]) => ({ offset: fine(offset), "stop-color": formatColor(color) })) };
}

export function gradientAt(blend: MorphGradientBlend, progress: number): MorphGradientState {
  const t = clamp01(progress);
  const [a, b] = blend.ends;
  const lerp = (v: number, w: number) => v * (1 - t) + w * t;
  const mix = (x: number[], y: number[]) => x.map((v, i) => lerp(v, y[i]!));
  return gradientAttributes({
    ...a,
    geometry: mix(a.geometry, b.geometry),
    transform: mix(a.transform, b.transform),
    stops: a.stops.map(([offset, color], i) => [lerp(offset, b.stops[i]![0]), blendColor(color, b.stops[i]![1], t)]),
  });
}

export function poseGradient(element: Element, state: MorphGradientState) {
  Object.assign(element.attributes, state.attributes);
  elementsOf(element.children)
    .filter((child) => child.tagName === "stop")
    .forEach((stop, i) => {
      const values = state.stops[i];
      if (values) Object.assign(stop.attributes, values);
    });
}

export type MorphGroupPose = { state: string; last?: number } | { segment: number; progress: number };

export function morphPosesAt(artifact: MorphArtifact, offset: number): Record<string, MorphGroupPose> {
  const at = clamp01(offset);
  const poses: Record<string, MorphGroupPose> = table();
  for (const [group, entries] of Object.entries(artifact.schedules)) {
    let last: number | undefined;
    let pose: MorphGroupPose | undefined;
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

export interface MorphFrameState {
  shown: Set<string>;
  hidden: Set<string>;
  geometry: Map<string, string>;
  paint: Map<string, Record<string, string>>;
  gradients: Map<string, MorphGradientState>;
  opacity: Map<string, number>;
  clips: Map<string, string>;
  reaches: Map<string, string>;
}

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
  const writeClip = (clip: number, loops: MorphGeometryRef, p: number, reachable: MorphClipFrames["reach"] = []) => {
    const samples = artifact.apertures[loops.index]!;
    const edges = artifact.apertureEdges[loops.index];
    const d = aperturePathData(samples, loops, p);
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
    for (const node of new Set(Object.values(states).flat())) {
      (before.has(node) && after.has(node) ? shown : hidden).add(node);
    }
    for (const t of segment.transitions) {
      switch (t.kind) {
        case "morph": {
          if (p >= 1) {
            show(t.to);
            break;
          }
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
    holdApertures(artifact, group, pose.segment, writeClip);
    for (const clip of segment.clips) writeClip(clip.clip, clip.loops, p, clip.reach);
  }
  for (const entry of artifact.paints ?? []) paintPose(artifact, entry, own(poses, entry.group), state);
  return state;
}

function paintPose(artifact: MorphArtifact, entry: MorphPaintPose, pose: MorphGroupPose | undefined, state: MorphFrameState) {
  if (!pose) return;
  const colors: ["fill" | "stroke", MorphColor][] = [];
  if (entry.fill) colors.push(["fill", entry.fill]);
  if (entry.stroke) colors.push(["stroke", entry.stroke]);
  const write = (node: string, base: MorphPaintBase | undefined, w: number) => {
    if (w <= 0 || state.hidden.has(node)) return;
    const values = state.paint.get(node) ?? table();
    for (const [name, color] of colors) {
      const own = base?.[name];
      if (w >= 1 || own) values[name] = formatColor(w >= 1 || !own ? color : blendColor(own, color, w));
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
  const drawing = new Set(p > 0 && p < 1 ? segment.transitions.flatMap((t) => (t.kind === "morph" || t.kind === "scale" ? [t.draw] : [])) : []);
  for (const [node, base] of Object.entries(entry.nodes)) {
    if (drawing.has(node)) continue;
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
    write(track.draw, base, w);
  }
}

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

export function renderMorphAt(artifact: MorphArtifact, offset: number): string {
  if (artifact.status !== "live") return artifact.rest;
  return renderMorphState(artifact, morphFrameState(artifact, morphPosesAt(artifact, offset)));
}

export function poseLeaf(element: Element, node: string, state: MorphFrameState) {
  if (state.shown.has(node)) setStyleProperty(element, "display", undefined);
  else if (state.hidden.has(node)) setStyleProperty(element, "display", "none");
  const d = state.geometry.get(node);
  if (d !== undefined) element.attributes["d"] = d;
  for (const [name, value] of Object.entries(state.paint.get(node) ?? {})) {
    setStyleProperty(element, name, styleDeclaration(element, name)?.important ? `${value} !important` : value);
  }
  const o = state.opacity.get(node);
  if (o !== undefined) multiplyOpacity(element, o);
}

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
    svg.attributes["x"] = "0";
    svg.attributes["y"] = "0";
    svg.attributes["width"] = "100%";
    svg.attributes["height"] = "100%";
    root.children.push(svg);
  }
  return stringify([root], { quote: "'", selfClosingTags: ["path"] });
}
