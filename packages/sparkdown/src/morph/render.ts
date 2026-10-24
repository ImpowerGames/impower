// A reference renderer for artifacts: the whole picture at one pose as a
// single SVG document. It states the playback rules a live player follows
// (README.md, "Playing an artifact") in executable form, and lets tests and
// verification captures look at any pose without a player.

import { parse, stringify, type Node } from "../txml/txml";
import { own } from "./own";
import { setStyleProperty, styleProperty } from "./svgDocument";
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
  const authored = styleProperty(element, "opacity") ?? element.attributes["opacity"] ?? "1";
  const own = Number.parseFloat(authored);
  setStyleProperty(element, "opacity", fmt((Number.isFinite(own) ? own : 1) * factor));
};

/**
 * The artifact drawn at `pose` as one SVG: each part nested in paint order,
 * the live parts posed. A static artifact draws its rest render.
 */
export function renderMorphFrame(artifact: MorphArtifact, pose: MorphPose): string {
  if (artifact.status !== "live" || pose === "rest") return artifact.rest;
  const segment = artifact.segments[pose.segment];
  if (!segment) return artifact.rest;
  const p = clamp01(pose.progress);
  const shown = new Set<string>();
  const hidden = new Set<string>();
  const geometry = new Map<string, string>();
  const opacity = new Map<string, number>();
  // Groups other than the moving one hold their schedule's first state.
  for (const [group, states] of Object.entries(artifact.visibility)) {
    if (group === segment.group) continue;
    const first = own(artifact.schedules, group)?.[0]?.state;
    const all = new Set(Object.values(states).flat());
    for (const node of all) (own(states, first ?? "")?.includes(node) ? shown : hidden).add(node);
  }
  const groupStates = own(artifact.visibility, segment.group) ?? {};
  const before = new Set(own(groupStates, segment.from.state) ?? []);
  const after = new Set(own(groupStates, segment.to.state) ?? []);
  // Every drawing of the moving group starts hidden, including those of
  // states this segment does not touch (the open pose during `half → closed`);
  // drawings in both poses stay, and the transitions below decide the rest.
  for (const node of new Set(Object.values(groupStates).flat())) {
    (before.has(node) && after.has(node) ? shown : hidden).add(node);
  }
  const show = (node: string | undefined) => {
    if (!node) return;
    hidden.delete(node);
    shown.add(node);
  };
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
        show(t.node);
        const full = t.direction === "shrink" ? p <= 0 : p >= 1;
        if (full) break;
        const frames = artifact.frames[t.frames.index]!;
        geometry.set(t.node, framePathData(frames, sampleAt(frames.frames, t.frames, p)));
        break;
      }
      case "hold":
        show(t.node);
        break;
    }
  }
  const clipData = new Map<string, string>();
  for (const clip of segment.clips) {
    const d = aperturePathData(artifact.apertures[clip.loops.index]!, clip.loops, p);
    for (const target of artifact.clipTargets) if (target.clip === clip.clip) clipData.set(target.clipPath, d);
  }
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
        if (node !== undefined) {
          // The inline declaration the live part is written with.
          if (shown.has(node)) setStyleProperty(element, "display", undefined);
          else if (hidden.has(node)) setStyleProperty(element, "display", "none");
          const d = geometry.get(node);
          if (d !== undefined) element.attributes["d"] = d;
          const o = opacity.get(node);
          if (o !== undefined) multiplyOpacity(element, o);
        }
        if (element.tagName === "clipPath") {
          const d = clipData.get(element.attributes["id"] ?? "");
          const path = elementsOf(element.children)[0];
          if (d !== undefined && path) path.attributes["d"] = d;
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
