// The bake: one image variant's artwork and one morph recipe in, one
// artifact out. Pure and host-independent; every host runs this same code
// (see README.md). It is a generator so the asynchronous runner can yield and
// observe cancellation between drawings.

import {
  buildApertures,
  morphScale,
  morphSubpaths,
  pairShapes,
  pinchCrossings,
  type BendTrack,
  type EdgeTrack,
  type LabelledShape,
  type MorphResult,
  type Point,
  type Subpath,
  type SubpathMorph,
} from "@impower/spark-morph/src/index";
import {
  decodeSVGSource,
  evaluateAttributeVisibility,
  filterSVGAttributes,
  normalizeSVGAttributeNames,
  type AttributeSelection,
} from "../attributes";
import { bindVariant, morphRequirements } from "../compiler/morph/bindMorph";
import { MORPH_DEPTH_REST, parseMorphDepth } from "../compiler/morph/morphSchema";
import {
  applySubpaths,
  invert,
  isIdentity,
  type Affine,
} from "./affine";
import { hashText } from "./hash";
import { own, table } from "./own";
import { recipeAsMorph } from "./recipe";
import {
  ancestry,
  cloneElement,
  compositingValue,
  styleDeclarations,
  convertToPath,
  drawnLeaves,
  effectiveLabel,
  extractTree,
  isAncestorOrSelf,
  isShape,
  localGeometry,
  namespaceTree,
  partClosure,
  readArtDocument,
  serialize,
  setStyleProperty,
  unreadableGeometry,
  type ArtDocument,
  type Element,
} from "./svgDocument";
import {
  MORPH_BAKE_FORMAT,
  type MorphArtifact,
  type MorphBakeDiagnostic,
  type MorphBlend,
  type MorphClipTarget,
  type MorphFallback,
  type MorphFrames,
  type MorphGeometryRef,
  type MorphMethodName,
  type MorphPart,
  type MorphRecipe,
  type MorphSegment,
  type MorphTransition,
} from "./types";

/** Frames per segment: the tuning point the geometry package was tested at. */
export const MORPH_BAKE_SAMPLES = 8;
/**
 * How far, in screen pixels, an aperture at rest reaches past its outline:
 * far enough that the outline's antialiased edge lies under the drawings
 * around the opening.
 */
export const APERTURE_REACH = 1;
const PRECISION = 1000;
const round = (n: number) => Math.round(n * PRECISION) / PRECISION || 0;

export interface MorphBakeInput {
  /** The artwork: SVG text or an `image/svg+xml` data URI. */
  source: string;
  /** The variant's attribute selection. */
  selection: AttributeSelection;
  recipe: MorphRecipe;
  /** The artifact's identity (`MorphRef.key`). */
  key: string;
  /** The variant's context key, for diagnostics. */
  variant?: string;
  /** The artwork's URI, for diagnostics. */
  uri?: string;
}

/**
 * Geometry that depends only on the source: each drawing pair's root-space
 * morph result (failures included), its sampled frames in a given element
 * space, and the aperture samples of a set of edges. One cache per source is
 * shared by every variant and recipe baked from it, and a bake served from it
 * reports exactly what a fresh one would.
 */
export type MorphGeometryEntry = MorphResult | MorphFrames | number[][][];

export interface MorphGeometryCache {
  get(key: string): MorphGeometryEntry | undefined;
  set(key: string, value: MorphGeometryEntry): void;
}

export interface MorphBakeOptions {
  geometry?: MorphGeometryCache;
}

type Rest = typeof REST;
const REST = Symbol("rest");

/**
 * A clip target's aperture: its clip entry and id, and the matrices from
 * root space into the target's parent space and back.
 */
interface Wrapper {
  clip: number;
  id: string;
  matrix: Affine;
  space: Affine;
}

/** An affine matrix written with every digit, so a pair that should cancel does. */
const exactAffine = (m: Affine) => `matrix(${m.join(" ")})`;

interface Leaf {
  element: Element;
  node: string;
  key: string;
  label: string;
  group?: string;
  live: boolean;
}

/** A disabled morph: the plain static render and the reasons. */
function staticArtifact(
  input: MorphBakeInput,
  text: string,
  diagnostics: MorphBakeDiagnostic[],
): MorphArtifact {
  let rest = text;
  try {
    rest = filterSVGAttributes(text, input.selection);
  } catch {
    // An unparseable source is already reported; serve it as written.
  }
  return {
    format: MORPH_BAKE_FORMAT,
    key: input.key,
    morph: input.recipe.name,
    ...(input.variant === undefined ? {} : { variant: input.variant }),
    status: "static",
    rest,
    idPrefix: idPrefixFor(input.key),
    parts: [],
    visibility: {},
    schedules: {},
    segments: [],
    frames: [],
    apertures: [],
    clipTargets: [],
    diagnostics,
  };
}

/**
 * The artifact's id prefix. Underscores never occur in path data, numbers or
 * colours, so a player can swap the prefix with a plain text replacement.
 */
export const idPrefixFor = (key: string) => `_m${hashText(key).slice(0, 8)}_`;

/**
 * Whether splitting this element's content across parts would change how it
 * composites: an opacity under 1, a filter, a mask, a blend mode or
 * isolation, from its attributes or its inline style.
 */
function composites(element: Element): boolean {
  for (const [name, value] of Object.entries(element.attributes)) {
    if (typeof value === "string" && compositingValue(name.toLowerCase(), value)) return true;
  }
  return styleDeclarations(element).some(([name, , clean]) => compositingValue(name, clean));
}

const packed = (subpaths: Subpath[]): number[] => {
  const out: number[] = [];
  for (const s of subpaths) {
    for (const c of s.segments) out.push(c.p0[0], c.p0[1], c.c1[0], c.c1[1], c.c2[0], c.c2[1], c.p1[0], c.p1[1]);
  }
  return out;
};

const pathData = (subpaths: Subpath[]): string =>
  subpaths
    .map((s) => {
      if (!s.segments.length) return "";
      let d = `M${round(s.segments[0]!.p0[0])},${round(s.segments[0]!.p0[1])}`;
      for (const c of s.segments) {
        d += `C${round(c.c1[0])},${round(c.c1[1])} ${round(c.c2[0])},${round(c.c2[1])} ${round(c.p1[0])},${round(c.p1[1])}`;
      }
      return s.closed ? `${d}Z` : d;
    })
    .join("");

/** The area one aperture loop encloses, its sign the way the loop winds. */
function signedLoopArea(flat: number[]): number {
  let twice = 0;
  for (let i = 0; i + 1 < flat.length; i += 2) {
    const j = (i + 2) % flat.length;
    twice += flat[i]! * flat[j + 1]! - flat[j]! * flat[i + 1]!;
  }
  return twice / 2;
}

/** The area one aperture loop encloses. */
const loopArea = (flat: number[]): number => Math.abs(signedLoopArea(flat));

/**
 * The ratio of a matrix's largest stretch to its smallest (its linear part's
 * singular values), Infinity for a collapsed one.
 */
function conditionOf(m: Affine): number {
  const [a, b, c, d] = m;
  const sum = a * a + b * b + c * c + d * d;
  const det = Math.abs(a * d - b * c);
  const root = Math.sqrt(Math.max(0, sum * sum - 4 * det * det));
  const least = Math.sqrt(Math.max(0, (sum - root) / 2));
  return least > 0 ? Math.sqrt((sum + root) / 2) / least : Infinity;
}

/**
 * A rest aperture loop at most this fraction of the widest loop its entry
 * opens to is closed: it gets no reach.
 */
const CLOSED_FRACTION = 0.01;

/**
 * The most a target may move, as a fraction of its entry's apertures'
 * extent, when a browser composes the masked wrapper's matrix and the inner
 * group's in single precision, for the mask to sit in root space.
 */
const ROOTED_ERROR_FRACTION = 1e-4;

const loopsPathData = (loops: number[][]): string =>
  loops
    .map((flat) => {
      if (flat.length < 2) return "";
      let d = `M${flat[0]},${flat[1]}`;
      for (let i = 2; i + 1 < flat.length; i += 2) d += `L${flat[i]},${flat[i + 1]}`;
      return `${d}Z`;
    })
    .join("");

/**
 * A cubic's ends and the points where it turns in x or y, which together
 * bound it: its handles can reach past the curve, its ends alone fall short.
 */
const cubicExtremes = (c: Subpath["segments"][number]): Point[] => {
  const at = (t: number): Point => {
    const u = 1 - t;
    const [a, b, d, e] = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
    return [
      a * c.p0[0] + b * c.c1[0] + d * c.c2[0] + e * c.p1[0],
      a * c.p0[1] + b * c.c1[1] + d * c.c2[1] + e * c.p1[1],
    ];
  };
  const points: Point[] = [c.p0, c.p1];
  for (const axis of [0, 1] as const) {
    const [p, q, r, s] = [c.p0[axis], c.c1[axis], c.c2[axis], c.p1[axis]];
    // Where the derivative, a quadratic in t, is zero.
    const qa = -p + 3 * q - 3 * r + s;
    const qb = 2 * (p - 2 * q + r);
    const qc = q - p;
    const roots =
      Math.abs(qa) < 1e-12
        ? Math.abs(qb) < 1e-12
          ? []
          : [-qc / qb]
        : (() => {
            const disc = qb * qb - 4 * qa * qc;
            if (disc < 0) return [];
            const root = Math.sqrt(disc);
            return [(-qb + root) / (2 * qa), (-qb - root) / (2 * qa)];
          })();
    for (const t of roots) if (t > 0 && t < 1) points.push(at(t));
  }
  return points;
};

const isLine = (c: Subpath["segments"][number]) =>
  c.c1[0] === c.p0[0] && c.c1[1] === c.p0[1] && c.c2[0] === c.p1[0] && c.c2[1] === c.p1[1];

/**
 * Frames of a root-space morph, mapped into an element's own user space.
 * Closed polylines in every frame (the bend method's handoff) are stored as
 * their anchors alone, a quarter of the full cubic layout.
 */
function framesFor(morph: SubpathMorph, space: Affine): MorphFrames {
  const count = MORPH_BAKE_SAMPLES;
  const sampled: Subpath[][] = [];
  for (let i = 0; i < count; i++) sampled.push(applySubpaths(space, morph.frame(i / (count - 1))));
  const first = sampled[0]!;
  const lines = sampled.every((frame) => frame.every((s) => s.closed && s.segments.every(isLine)));
  const frames = sampled.map((frame) =>
    lines
      ? frame.flatMap((s) => s.segments.flatMap((c) => [round(c.p0[0]), round(c.p0[1])]))
      : packed(frame).map(round),
  );
  return {
    count,
    segmentCounts: first.map((s) => s.segments.length),
    closed: first.map((s) => s.closed),
    ...(lines ? { lines: true } : {}),
    frames,
  };
}

const reversedBend = (track: BendTrack): BendTrack => ({
  ...track,
  from: track.to,
  to: track.from,
  canonicalFrom: track.canonicalTo,
  canonicalTo: track.canonicalFrom,
  frame: (p) => track.frame(1 - p),
  canonical: (p) => track.canonical(1 - p),
  tips: (p) => track.tips(1 - p),
  edges: (p, n) => track.edges(1 - p, n),
});

/**
 * A closed polyline resampled to `count` points evenly spaced along its
 * outline, starting at its first point. A loop that already has `count`
 * points is returned as it is.
 */
export function resampleLoop(loop: Point[], count: number): Point[] {
  if (loop.length === count || loop.length === 0) return loop;
  const lengths: number[] = [0];
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i]!;
    const b = loop[(i + 1) % loop.length]!;
    lengths.push(lengths[i]! + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = lengths[loop.length]!;
  const out: Point[] = [];
  let edge = 0;
  for (let k = 0; k < count; k++) {
    const at = (total * k) / count;
    while (edge < loop.length - 1 && lengths[edge + 1]! < at) edge++;
    const a = loop[edge]!;
    const b = loop[(edge + 1) % loop.length]!;
    const span = lengths[edge + 1]! - lengths[edge]!;
    const f = span > 0 ? (at - lengths[edge]!) / span : 0;
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  return out;
}

const isBend = (track: unknown): track is BendTrack =>
  !!track && typeof (track as BendTrack).tips === "function" && typeof (track as BendTrack).edges === "function";

/**
 * Bakes one variant. The generator yields between drawings; run it with
 * `bakeMorphArtifact` or `bakeMorphArtifactAsync`.
 */
export function* bakeSteps(
  input: MorphBakeInput,
  options: MorphBakeOptions = {},
): Generator<void, MorphArtifact, void> {
  const { recipe, selection } = input;
  const diagnostics: MorphBakeDiagnostic[] = [];
  const report = (
    code: MorphBakeDiagnostic["code"],
    severity: MorphBakeDiagnostic["severity"],
    message: string,
    where: { layer?: string; path?: string } = {},
  ) => {
    // A drawing that fails in one segment fails again in the segment that
    // moves it back; it is one problem with the art.
    if (diagnostics.some((d) => d.code === code && d.message === message && d.path === where.path)) return;
    diagnostics.push({
      code,
      severity,
      message,
      morph: recipe.name,
      ...(input.uri === undefined ? {} : { uri: input.uri }),
      ...(input.variant === undefined ? {} : { variant: input.variant }),
      ...(where.layer === undefined ? {} : { layer: where.layer }),
      ...(where.path === undefined ? {} : { path: where.path }),
    });
  };
  let text: string;
  let doc: ArtDocument | undefined;
  try {
    text = normalizeSVGAttributeNames(decodeSVGSource(input.source));
    doc = readArtDocument(text);
  } catch {
    text = input.source;
    doc = undefined;
  }
  if (!doc) {
    report("source-unreadable", "error", "The artwork could not be read as SVG, so it shows without the morph.");
    return staticArtifact(input, text, diagnostics);
  }
  const vocabulary = doc.vocabulary;
  const disable = () => staticArtifact(input, text, diagnostics);

  // Which drawings exist, which a state hides, what composites and what each
  // part references are read from attributes and inline styles. A style
  // sheet's rules could change any of them, and the bake does not read them,
  // so artwork carrying one keeps its static render.
  if (doc.styleSheet) {
    report(
      "unsupported-element",
      "error",
      `This artwork carries a style sheet (\`${doc.styleSheet}\`), whose rules the bake does not read, so this variant shows without the morph. Inline \`style\` attributes and presentation attributes are read.`,
    );
    return disable();
  }

  // Binding: the same rules compilation applied, against the source as it is
  // now. A variant the morph does not play on keeps its plain render.
  const requirements = morphRequirements(recipeAsMorph(recipe));
  const binding = bindVariant(vocabulary, input.variant ?? "", selection, requirements);
  if (binding.status !== "active") {
    const why = binding.problems.map((p) => p.message).join("; ");
    report(
      "inactive-variant",
      "warning",
      `\`${recipe.name}\` does not play on this variant${why ? `: ${why}` : `: it rests in a state the morph does not start from`}.`,
    );
    return disable();
  }

  // Each group's schedule, with the variant's own resting choice standing in
  // for the state the morph starts from, and for the ends a keyframe leaves
  // out (the CSS rule for an omitted first or last value).
  const restName = (group: string): string => {
    const chosen = own(selection, group);
    if (chosen !== undefined) return chosen;
    const choices = new Set(Object.values(binding.rest[group] ?? {}));
    return choices.size === 1 ? [...choices][0]! : (requirements.rest.get(group) ?? "rest");
  };
  const schedules = new Map<string, { offset: number; state: string | Rest }[]>();
  for (const group of requirements.groups.keys()) {
    const start = requirements.rest.get(group);
    const entries: { offset: number; state: string | Rest }[] = [];
    for (const keyframe of recipe.keyframes) {
      const state = own(keyframe.states, group);
      if (state === undefined) continue;
      entries.push({ offset: keyframe.offset, state: start !== undefined && state === start ? REST : state });
    }
    if (!entries.length) continue;
    if (entries[0]!.offset > 0) entries.unshift({ offset: 0, state: REST });
    if (entries[entries.length - 1]!.offset < 1) entries.push({ offset: 1, state: REST });
    schedules.set(group, entries);
  }

  const selectionFor = (group: string, state: string | Rest): AttributeSelection =>
    state === REST ? selection : { ...selection, [group]: state };
  const stateKey = (state: string | Rest) => (state === REST ? "" : state);
  const restVisible = evaluateAttributeVisibility(vocabulary, selection).visible;
  const visibleIn = new Map<string, Map<string, Record<string, boolean>>>();
  for (const [group, entries] of schedules) {
    const byState = new Map<string, Record<string, boolean>>();
    for (const { state } of entries) {
      if (!byState.has(stateKey(state))) {
        byState.set(stateKey(state), evaluateAttributeVisibility(vocabulary, selectionFor(group, state)).visible);
      }
    }
    visibleIn.set(group, byState);
  }

  // Which group each layer belongs to: the one whose states change its
  // visibility. A layer two groups both switch cannot be split between them.
  const groupOf = new Map<string, string>();
  for (const layer of vocabulary.layers) {
    for (const [group, byState] of visibleIn) {
      const values = new Set([...byState.values()].map((v) => !!v[layer.key]));
      if (values.size < 2) continue;
      const other = groupOf.get(layer.key);
      if (other && other !== group) {
        report(
          "mixed-groups",
          "error",
          `Layer "${layer.name}" changes with both \`${other}\` and \`${group}\`; a drawing can belong to only one group the morph drives.`,
          { layer: layer.name, path: layer.key },
        );
        return disable();
      }
      groupOf.set(layer.key, group);
    }
  }
  const keyOf = (element: Element): string | undefined => {
    for (const entry of ancestry(doc!, element)) if (entry.key !== undefined) return entry.key;
    return undefined;
  };
  const visibleAt = (element: Element, visible: Record<string, boolean>) => {
    const key = keyOf(element);
    return key === undefined ? true : !!visible[key];
  };
  const unionVisible = (element: Element) =>
    visibleAt(element, restVisible) ||
    [...visibleIn.values()].some((byState) => [...byState.values()].some((v) => visibleAt(element, v)));

  // Clip targets: the outermost layer carrying each target label.
  const targetsByClip: Element[][] = recipe.clips.map((clip, index) => {
    const found: Element[] = [];
    for (const label of clip.targets) {
      const matches = [...doc!.byKey.values()].filter((e) => e.layer?.parsed.label === label && !e.resource);
      if (!matches.length) {
        report("target-missing", "warning", `Clip ${index + 1} targets \`${label}\`, but this artwork has no layer with that label.`, { layer: label });
      }
      for (const match of matches) found.push(match.element);
    }
    return found.filter((e) => !found.some((other) => other !== e && isAncestorOrSelf(doc!, other, e)));
  });

  const allLeaves = drawnLeaves(doc).filter(unionVisible);
  const inTarget = (element: Element) =>
    targetsByClip.some((targets) => targets.some((t) => isAncestorOrSelf(doc!, t, element)));
  const live = new Set<Element>();
  for (const element of allLeaves) {
    const key = keyOf(element);
    if ((key !== undefined && groupOf.has(key)) || inTarget(element)) live.add(element);
  }
  // The drawings that change: state layers and clip targets. Live parts also
  // hold unchanging art a compositing group keeps with them.
  const moving = new Set(live);
  // A group that composites as a whole (opacity, filters, masks, blending)
  // cannot be split between parts without changing how it looks.
  let grew = true;
  while (grew) {
    grew = false;
    for (const element of [...live]) {
      for (const entry of ancestry(doc, element)) {
        if (entry.element === element || !composites(entry.element)) continue;
        for (const leaf of drawnLeaves(doc, entry.element)) {
          if (unionVisible(leaf) && !live.has(leaf)) {
            live.add(leaf);
            grew = true;
          }
        }
      }
    }
  }
  const leaves: Leaf[] = [];
  const leafOf = new Map<Element, Leaf>();
  let nodeCount = 0;
  for (const element of allLeaves) {
    const key = keyOf(element) ?? "";
    const leaf: Leaf = {
      element,
      node: live.has(element) ? `n${nodeCount++}` : "",
      key,
      label: effectiveLabel(doc, element),
      live: live.has(element),
      ...(groupOf.has(key) ? { group: groupOf.get(key)! } : {}),
    };
    leaves.push(leaf);
    leafOf.set(element, leaf);
  }
  const nodeOf = (leaf: Leaf) => leaf.node;
  const isPath = (leaf: Leaf) => leaf.element.tagName.toLowerCase() === "path";
  /**
   * Nodes of hidden copies of a live drawing, written beside it in its part,
   * each carrying one more moving shape at that drawing's depth. A copy of a
   * basic shape is written as the equivalent `<path>`, so a player can set
   * its `d`; the drawing itself keeps its authored markup, so the parts
   * draw exactly what the rest render does.
   */
  const carriers = new Map<Leaf, string[]>();
  const carrierOf = (leaf: Leaf, index: number): string => {
    const list = carriers.get(leaf) ?? [];
    while (list.length <= index) list.push(`n${nodeCount++}`);
    carriers.set(leaf, list);
    return list[index]!;
  };

  // Policy by the nearest configured label, field by field.
  const policy = <F extends "blend" | "method" | "fallback">(leaf: Leaf, field: F): MorphRecipe[F] => {
    for (const entry of ancestry(doc!, leaf.element)) {
      const label = entry.layer?.parsed.label;
      const value = label ? own(recipe.layers, label)?.[field] : undefined;
      if (value) return value as MorphRecipe[F];
    }
    return recipe[field];
  };
  // `depth` by the nearest label that sets it, and the label it came from:
  // the place a pose that draws none of the label's moving shapes is reported.
  const depthOf = (leaf: Leaf): { depth: string; label?: string } => {
    for (const entry of ancestry(doc!, leaf.element)) {
      const label = entry.layer?.parsed.label;
      const depth = label ? own(recipe.layers, label)?.depth : undefined;
      if (depth) return { depth, label };
    }
    return { depth: recipe.depth ?? MORPH_DEPTH_REST };
  };
  /**
   * What the pose a `depth` names shows, for a drawing that changes with
   * `group`: the rest pose for `rest` and for the state the morph starts
   * from, which stands for the variant's own resting choice. Undefined when
   * the pose is not one of `group`'s, so it says nothing about the drawing.
   */
  const depthPose = (depth: string, group: string): Record<string, boolean> | undefined => {
    const pose = parseMorphDepth(depth);
    if (!pose || pose === MORPH_DEPTH_REST) return restVisible;
    if (pose.group !== group) return undefined;
    if (pose.state === requirements.rest.get(group)) return restVisible;
    return visibleIn.get(group)?.get(pose.state);
  };
  /** The centre of a drawing's box in root space, curves included. */
  const centre = (leaf: Leaf): Point | undefined => {
    const geometry = rootGeometry(leaf);
    if (!geometry) return undefined;
    let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const subpath of geometry) {
      for (const cubic of subpath.segments) {
        for (const [x, y] of cubicExtremes(cubic)) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }
    return minX <= maxX ? [(minX + maxX) / 2, (minY + maxY) / 2] : undefined;
  };
  /**
   * The drawing of `leaf`'s label that `pose` shows among the drawings of
   * `group` whose geometry the bake reads, so a carrier copied from it takes
   * the moving frames: where it has several, the one whose box centre is
   * nearest `leaf`'s, the first in paint order on a tie.
   */
  const drawingIn = (pose: Record<string, boolean>, leaf: Leaf, group: string): Leaf | undefined => {
    const origin = centre(leaf);
    let best: { leaf: Leaf; distance: number } | undefined;
    for (const candidate of leaves) {
      if (!candidate.live || candidate.group !== group || candidate.label !== leaf.label) continue;
      if (!visibleAt(candidate.element, pose)) continue;
      const at = centre(candidate);
      if (!at) continue;
      const distance = origin ? Math.hypot(at[0] - origin[0], at[1] - origin[1]) : 0;
      if (!best || distance < best.distance) best = { leaf: candidate, distance };
    }
    return best?.leaf;
  };
  /** Per label and named pose, whether any moving shape drew at that pose's place. */
  const depthUse = new Map<string, { label: string; depth: string; groups: Set<string>; used: boolean }>();

  // Geometry in root user space.
  const geometryOf = new Map<Leaf, Subpath[] | null>();
  const rootGeometry = (leaf: Leaf): Subpath[] | null => {
    if (geometryOf.has(leaf)) return geometryOf.get(leaf)!;
    let value: Subpath[] | null = null;
    const unreadable = isShape(leaf.element) ? unreadableGeometry(leaf.element) : undefined;
    if (unreadable) {
      report("unsupported-element", "warning", `Layer "${leaf.label || leaf.key}" sets its geometry with ${unreadable}, which this bake cannot read exactly, so it fades instead of moving.`, { layer: leaf.label, path: leaf.key });
    } else if (isShape(leaf.element)) {
      const local = localGeometry(leaf.element) ?? [];
      const space = doc!.info.get(leaf.element)?.rootFromElement ?? null;
      if (!space) {
        report("unsupported-transform", "warning", `Layer "${leaf.label || leaf.key}" has a transform this bake cannot follow, so it fades instead of moving.`, { layer: leaf.label, path: leaf.key });
      } else if (local.length) {
        value = applySubpaths(space, local);
      }
    }
    geometryOf.set(leaf, value);
    return value;
  };
  const elementSpace = (leaf: Leaf): Affine | null => {
    const m = doc!.info.get(leaf.element)?.rootFromElement;
    return m ? invert(m) : null;
  };

  const geometryCache: MorphGeometryCache = options.geometry ?? new Map();
  const frames: MorphFrames[] = [];
  const frameIndex = new Map<string, number>();
  const addFrames = (cacheKey: string, morph: SubpathMorph, space: Affine, reversed: boolean): MorphGeometryRef => {
    const forward = `${cacheKey}|${space.join(",")}`;
    const hit = frameIndex.get(forward);
    if (hit !== undefined) return { index: hit, reversed };
    let sampled = geometryCache.get(`frames:${forward}`) as MorphFrames | undefined;
    if (!sampled) {
      sampled = framesFor(morph, space);
      geometryCache.set(`frames:${forward}`, sampled);
    }
    frames.push(sampled);
    frameIndex.set(forward, frames.length - 1);
    return { index: frames.length - 1, reversed };
  };

  const morphFor = (from: Leaf, to: Leaf, method: MorphMethodName): { morph: SubpathMorph | null; cacheKey: string; reversed: boolean } => {
    const forward = `${from.key}>${to.key}:${method}`;
    const backward = `${to.key}>${from.key}:${method}`;
    let found: { result: MorphResult; cacheKey: string; reversed: boolean } | undefined;
    for (const [key, reversed] of [[forward, false], [backward, true]] as const) {
      const cached = geometryCache.get(`pair:${key}`) as MorphResult | undefined;
      if (cached !== undefined) {
        found = { result: cached, cacheKey: key, reversed };
        break;
      }
    }
    if (!found) {
      const result = morphSubpaths(rootGeometry(from)!, rootGeometry(to)!, { method });
      geometryCache.set(`pair:${forward}`, result);
      found = { result, cacheKey: forward, reversed: false };
    }
    const { result, cacheKey, reversed } = found;
    if (!result.ok) {
      report(
        "method-failed",
        "warning",
        `\`${method}\` could not morph "${from.label}" (${result.failure.code}: ${result.failure.message}), so it uses its fallback.`,
        // The pair's canonical source, so the segment that moves the same
        // pair back reports the same problem rather than a second one.
        { layer: from.label, path: cacheKey.slice(0, cacheKey.indexOf(">")) },
      );
      return { morph: null, cacheKey, reversed };
    }
    return { morph: result.morph, cacheKey, reversed };
  };

  const segments: MorphSegment[] = [];
  const apertures: number[][][][] = [];
  const apertureIndex = new Map<string, number>();
  /** Per clip, the loops of its first segment's start pose: its rest aperture. */
  const restLoops: (number[][] | undefined)[] = recipe.clips.map(() => undefined);
  const clipHasFrames = recipe.clips.map(() => false);

  // A clip's `between` lists the edge names it accepts, so one morph serves
  // portraits that name their edges differently (both lashes `eyelash-right`
  // in one, `eyelash-top-right` and `eyelash-bottom-right` in another). The
  // names this artwork draws have to form the aperture; drawing none of them
  // leaves nothing to cut.
  for (const [index, clip] of recipe.clips.entries()) {
    if (!clip.between.some((label) => leaves.some((leaf) => leaf.label === label))) {
      report(
        "edge-missing",
        "error",
        `Clip ${index + 1} accepts ${clip.between.map((l) => `"${l}"`).join(", ")} as edges, and this artwork draws none of them, so there is no aperture to cut.`,
        { layer: clip.between[0] },
      );
      return disable();
    }
  }
  // Every edge label is checked against its clip's targets once: an aperture
  // cannot clip the edge that forms it.
  for (const [index, clip] of recipe.clips.entries()) {
    for (const leaf of leaves) {
      if (!clip.between.includes(leaf.label)) continue;
      const target = targetsByClip[index]!.find((t) => isAncestorOrSelf(doc!, t, leaf.element));
      if (target) {
        report(
          "clip-self-dependent",
          "error",
          `Clip ${index + 1}'s edge "${leaf.label}" is inside its own target "${effectiveLabel(doc, target)}"; an aperture cannot clip the edge that forms it.`,
          { layer: leaf.label, path: leaf.key },
        );
        return disable();
      }
    }
  }

  for (const [group, entries] of schedules) {
    const byState = visibleIn.get(group)!;
    for (let i = 0; i + 1 < entries.length; i++) {
      const a = entries[i]!;
      const b = entries[i + 1]!;
      if (stateKey(a.state) === stateKey(b.state)) continue;
      const va = byState.get(stateKey(a.state))!;
      const vb = byState.get(stateKey(b.state))!;
      const groupLeaves = leaves.filter((l) => l.group === group);
      const fromOnly = groupLeaves.filter((l) => visibleAt(l.element, va) && !visibleAt(l.element, vb));
      const toOnly = groupLeaves.filter((l) => !visibleAt(l.element, va) && visibleAt(l.element, vb));
      const transitions: MorphTransition[] = [];
      const edgeTracks = new Map<number, { edges: EdgeTrack[]; keys: string[]; reversedAll: boolean; forwardAll: boolean }>();
      const unpairedFrom: Leaf[] = [];
      const unpairedTo: Leaf[] = [];
      const edgeNodes = new Set<string>();
      const shape = (leaf: Leaf): LabelledShape | undefined => {
        const geometry = rootGeometry(leaf);
        return geometry ? { id: leaf.node, label: leaf.label, subpaths: geometry } : undefined;
      };
      const fromShapes = fromOnly.map(shape).filter((s): s is LabelledShape => !!s);
      const toShapes = toOnly.map(shape).filter((s): s is LabelledShape => !!s);
      unpairedFrom.push(...fromOnly.filter((l) => !rootGeometry(l)));
      unpairedTo.push(...toOnly.filter((l) => !rootGeometry(l)));
      const byNode = new Map(leaves.filter((l) => l.live).map((l) => [l.node, l]));
      const pairing = pairShapes(fromShapes, toShapes);
      for (const d of pairing.diagnostics) {
        // Worded the same in either direction, so a segment and its reverse
        // report it once.
        const [fewer, more] = [d.fromCount, d.toCount].sort((a, b) => a - b);
        report("pairing-count", "warning", `"${d.label}" has ${fewer} drawings in one pose and ${more} in the other; neither is a single drawing, so they cannot pair and each uses its fallback.`, { layer: d.label });
      }
      for (const u of pairing.unpaired) (u.side === "from" ? unpairedFrom : unpairedTo).push(byNode.get(u.shape.id)!);
      // Tracks of this segment already drawing on each home drawing.
      const homed = new Map<Leaf, { node: boolean; carriers: number }>();
      for (const pair of pairing.pairs) {
        yield;
        const from = byNode.get(pair.from.id)!;
        const to = byNode.get(pair.to.id)!;
        const blend: MorphBlend = policy(from, "blend");
        if (blend === "fade" || blend === "cut") {
          transitions.push({ kind: blend, from: nodeOf(from), to: nodeOf(to) });
          continue;
        }
        if (blend === "scale") {
          unpairedFrom.push(from);
          unpairedTo.push(to);
          continue;
        }
        const method = policy(from, "method");
        if (!method) {
          report("missing-method", "error", `"${from.label}" morphs but has no \`method\`, so it uses its fallback.`, { layer: from.label, path: [from.key, to.key].sort()[0] });
          unpairedFrom.push(from);
          unpairedTo.push(to);
          continue;
        }
        const { morph, cacheKey, reversed } = morphFor(from, to, method);
        // A moving drawing paints at the depth its layer has in the pose its
        // `depth` names, in both directions, so the stacking holds for the
        // whole morph: it draws on whichever of its two drawings that pose
        // shows. By default that pose is the variant's rest pose, the pose
        // the static image shows, so the live layer order matches the still;
        // where the rest pose shows neither, it draws on the one it leaves.
        // A named pose that shows neither still holds its stacking through a
        // segment that does not reach it, on that pose's drawing of the same
        // label; one that draws no such shape leaves the rest pose to decide.
        const { depth, label: depthLabel } = depthOf(from);
        const named = depthPose(depth, group);
        const shows = (pose: Record<string, boolean>) => visibleAt(from.element, pose) || visibleAt(to.element, pose);
        const endIn = (pose: Record<string, boolean>) =>
          visibleAt(to.element, pose) && !visibleAt(from.element, pose) ? to : from;
        const posed =
          named && depth !== MORPH_DEPTH_REST && !shows(named) ? drawingIn(named, from, group) : undefined;
        const placed = !!named && (shows(named) || !!posed);
        const home = posed ?? endIn(named && shows(named) ? named : restVisible);
        const space = elementSpace(home);
        if (!morph || !space) {
          unpairedFrom.push(from);
          unpairedTo.push(to);
          continue;
        }
        if (depth !== MORPH_DEPTH_REST) {
          const where = depthLabel ?? from.label;
          const use = depthUse.get(`${where}\n${depth}`) ?? { label: where, depth, groups: new Set<string>(), used: false };
          use.groups.add(group);
          use.used ||= placed;
          depthUse.set(`${where}\n${depth}`, use);
        }
        // One element carries one shape, so a second track drawing on the
        // same home (two open lashes converging on the closed lash a variant
        // rests on) draws on a carrier copied beside it, at the same depth,
        // and so does every track of a basic shape, whose own markup stays.
        // A home in a pose this segment does not reach may be held, fading or
        // another pair's end, so a track always draws on a carrier there.
        const slots = homed.get(home) ?? { node: false, carriers: 0 };
        homed.set(home, slots);
        let draw: string;
        if (isPath(home) && !posed && !slots.node) {
          slots.node = true;
          draw = nodeOf(home);
        } else {
          draw = carrierOf(home, slots.carriers++);
        }
        const ref = addFrames(cacheKey, morph, space, reversed);
        transitions.push({ kind: "morph", from: nodeOf(from), to: nodeOf(to), draw, shared: pair.shared, frames: ref });
        for (const [clipIndex, clip] of recipe.clips.entries()) {
          if (!clip.between.includes(from.label)) continue;
          if (morph.tracks.length !== 1) {
            report("edge-compound", "error", `Clip ${clipIndex + 1}'s edge "${from.label}" is a compound drawing; an aperture edge must be one closed loop.`, { layer: from.label, path: from.key });
            return disable();
          }
          const track = morph.tracks[0];
          if (!isBend(track)) {
            report("edge-not-bend", "error", `Clip ${clipIndex + 1}'s edge "${from.label}" does not morph with \`bend\`; aperture edges need two tapered tips to meet.`, { layer: from.label, path: from.key });
            return disable();
          }
          const entry = edgeTracks.get(clipIndex) ?? { edges: [], keys: [], reversedAll: true, forwardAll: true };
          entry.edges.push({ id: pair.trackId, label: from.label, track: reversed ? reversedBend(track) : track });
          entry.keys.push(cacheKey);
          if (reversed) entry.forwardAll = false;
          else entry.reversedAll = false;
          edgeTracks.set(clipIndex, entry);
          edgeNodes.add(from.node).add(to.node);
        }
      }
      // A between-labelled drawing that does not morph cannot bound an aperture.
      for (const [clipIndex, clip] of recipe.clips.entries()) {
        for (const leaf of [...fromOnly, ...toOnly]) {
          if (clip.between.includes(leaf.label) && !edgeNodes.has(leaf.node)) {
            report("edge-not-bend", "error", `Clip ${clipIndex + 1}'s edge "${leaf.label}" does not morph to a matching drawing, so it cannot bound an aperture.`, { layer: leaf.label, path: leaf.key });
            return disable();
          }
        }
      }
      const oneSided = (leaf: Leaf, side: "from" | "to") => {
        if (inTarget(leaf.element)) {
          transitions.push({ kind: "hold", node: nodeOf(leaf) });
          return;
        }
        const blend = policy(leaf, "blend");
        const action: MorphFallback = blend === "morph" ? policy(leaf, "fallback") : blend;
        if (action === "scale") {
          const geometry = rootGeometry(leaf);
          const space = elementSpace(leaf);
          if (geometry && space) {
            const direction = side === "from" ? "shrink" : "grow";
            const morph = morphScale(geometry, direction);
            const ref = addFrames(`${leaf.key}:${direction}`, morph, space, false);
            // A basic shape scales on a carrier, after any a track of this
            // segment already draws on.
            const slots = homed.get(leaf) ?? { node: false, carriers: 0 };
            homed.set(leaf, slots);
            const draw = isPath(leaf) ? nodeOf(leaf) : carrierOf(leaf, slots.carriers++);
            transitions.push({ kind: "scale", node: nodeOf(leaf), draw, direction, frames: ref });
            return;
          }
          // Geometry the bake could not read was reported where it was read.
          if (!(isShape(leaf.element) && unreadableGeometry(leaf.element))) {
            report("unsupported-element", "warning", `"${leaf.label || leaf.key}" has no shape geometry to scale, so it fades.`, { layer: leaf.label, path: leaf.key });
          }
          transitions.push(side === "from" ? { kind: "fade", from: nodeOf(leaf) } : { kind: "fade", to: nodeOf(leaf) });
          return;
        }
        transitions.push(side === "from" ? { kind: action, from: nodeOf(leaf) } : { kind: action, to: nodeOf(leaf) });
      };
      for (const leaf of unpairedFrom) oneSided(leaf, "from");
      for (const leaf of unpairedTo) oneSided(leaf, "to");

      const clips: MorphSegment["clips"] = [];
      for (const [clipIndex, entry] of edgeTracks) {
        yield;
        const signature = [...entry.keys].sort().join("&");
        const reuse = apertureIndex.get(signature);
        let ref: MorphGeometryRef;
        const canonical = entry.forwardAll || entry.reversedAll;
        const known = canonical ? (geometryCache.get(`aperture:${signature}`) as number[][][] | undefined) : undefined;
        if (reuse !== undefined && canonical) {
          ref = { index: reuse, reversed: entry.reversedAll && !entry.forwardAll };
        } else if (known) {
          apertures.push(known);
          ref = { index: apertures.length - 1, reversed: entry.reversedAll && !entry.forwardAll };
          apertureIndex.set(signature, apertures.length - 1);
        } else {
          const built = buildApertures(entry.edges);
          for (const d of built.diagnostics) {
            const code = d.code === "ambiguous" ? "aperture-ambiguous" : d.code === "unpaired-edge" ? "aperture-unpaired" : "aperture-degenerate";
            report(code, "error", `Clip ${clipIndex + 1}: ${d.message}`, {});
          }
          if (built.diagnostics.length || !built.apertures.length) {
            if (!built.diagnostics.length) {
              report("aperture-unpaired", "error", `Clip ${clipIndex + 1}'s edges do not meet at their tips, so they enclose no aperture.`);
            }
            return disable();
          }
          const raw: Point[][][] = [];
          for (let s = 0; s < MORPH_BAKE_SAMPLES; s++) {
            raw.push(built.apertures.map((ap) => ap.loop(s / (MORPH_BAKE_SAMPLES - 1))));
          }
          // Corner caps and untangled crossings vary an aperture's point
          // count from sample to sample; a player blends neighbouring samples
          // point by point, so every sample of one aperture is given the same
          // number of points. Spacing points evenly cuts the loop's own
          // points off it and rounding moves them, which can fold a nearly
          // closed loop across itself; any crossing that leaves is pinched
          // out, the part winding the way the aperture's widest sample does
          // kept.
          const snap = ([x, y]: Point): Point => [round(x), round(y)];
          const signs = built.apertures.map((_, j) => {
            const areas = raw.map((loops) => signedLoopArea(loops[j]!.flat()));
            return Math.sign(areas.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0));
          });
          const samples: number[][][] = raw.map((loops) =>
            loops.map((loop, j) => {
              const points = Math.max(...raw.map((other) => other[j]!.length));
              return pinchCrossings(resampleLoop(loop, points).map(snap), signs[j]!, snap).flat();
            }),
          );
          // Stored in the edges' canonical direction, so a later segment that
          // moves the same edges back reuses it reversed. Edges that disagree
          // about direction have no canonical order and are not reused.
          const reversed = entry.reversedAll && !entry.forwardAll;
          if (reversed) samples.reverse();
          apertures.push(samples);
          ref = { index: apertures.length - 1, reversed };
          if (canonical) {
            apertureIndex.set(signature, apertures.length - 1);
            geometryCache.set(`aperture:${signature}`, samples);
          }
        }
        clips.push({ clip: clipIndex, loops: ref });
        clipHasFrames[clipIndex] = true;
        if (!restLoops[clipIndex]) {
          const table = apertures[ref.index]!;
          restLoops[clipIndex] = ref.reversed ? table[table.length - 1] : table[0];
        }
      }
      segments.push({
        group,
        from: { offset: a.offset, state: a.state === REST ? restName(group) : a.state },
        to: { offset: b.offset, state: b.state === REST ? restName(group) : b.state },
        transitions,
        clips,
      });
    }
  }
  // A label none of whose moving shapes the named pose draws keeps its
  // rest-pose stacking. A one-sided shape under it moves on no track, so
  // art that draws a shape in one pose only is not reported.
  for (const { label, depth, groups, used } of depthUse.values()) {
    if (used) continue;
    const pose = parseMorphDepth(depth);
    const group = pose && pose !== MORPH_DEPTH_REST ? pose.group : "";
    const others = [...groups].filter((g) => g !== group);
    report(
      "depth-ignored",
      "warning",
      others.length === groups.size
        ? `"${label}" changes with ${others.map((g) => `\`${g}\``).join(" and ")}, not \`${group}\`, so \`depth = ${depth}\` does not apply and it keeps its place in the rest pose.`
        : `\`depth = ${depth}\` draws none of the moving shapes of "${label}", so they keep their place in the rest pose.`,
      { layer: label },
    );
  }
  for (const [index, clip] of recipe.clips.entries()) {
    if (!clipHasFrames[index]) {
      report("edge-missing", "error", `Clip ${index + 1}'s edges (${clip.between.map((l) => `"${l}"`).join(", ")}) never move in this variant, so there is no aperture to cut.`, { layer: clip.between[0] });
      return disable();
    }
  }

  // Clip wrappers: each target is wrapped in a group masked by its entry's
  // aperture, in root space (or clipped by it, in the parent's space; see
  // below). The target's own clips and masks stay on it, so the two
  // intersect.
  const prefix = idPrefixFor(input.key);
  const clipTargets: MorphClipTarget[] = [];
  const wrappers = new Map<Element, Wrapper[]>();
  let clipSerial = 0;
  const freshId = (base: string) => {
    let id = base;
    while (doc!.byId.has(id)) id = `${base}-${++clipSerial}`;
    return id;
  };
  for (const [clipIndex, targets] of targetsByClip.entries()) {
    for (const target of targets) {
      if (!allLeaves.some((leaf) => isAncestorOrSelf(doc!, target, leaf))) continue;
      const parentSpace = doc.info.get(target)?.parent?.rootFromChildren ?? null;
      const matrix = parentSpace ? invert(parentSpace) : null;
      if (!matrix) {
        report("unsupported-transform", "error", `Clip ${clipIndex + 1}'s target "${effectiveLabel(doc, target)}" sits in a coordinate space this bake cannot map an aperture into.`);
        return disable();
      }
      const id = freshId(`morph-clip-${clipIndex}-${clipSerial++}`);
      const list = wrappers.get(target) ?? [];
      list.push({ clip: clipIndex, id, matrix, space: parentSpace! });
      wrappers.set(target, list);
      clipTargets.push({ clip: clipIndex, aperture: `${prefix}${id}`, matrix: [...matrix] });
    }
  }
  // Every point a clip entry's apertures reach, in root space, and the
  // largest area they open to.
  const apertureBounds = recipe.clips.map(() => ({ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity, widest: 0 }));
  for (const segment of segments) {
    for (const { clip, loops } of segment.clips) {
      const box = apertureBounds[clip]!;
      for (const sample of apertures[loops.index]!) {
        for (const flat of sample) {
          box.widest = Math.max(box.widest, loopArea(flat));
          for (let i = 0; i + 1 < flat.length; i += 2) {
            box.minX = Math.min(box.minX, flat[i]!);
            box.maxX = Math.max(box.maxX, flat[i]!);
            box.minY = Math.min(box.minY, flat[i + 1]!);
            box.maxY = Math.max(box.maxY, flat[i + 1]!);
          }
        }
      }
    }
  }
  // An aperture is a mask rather than a clip path so that at rest it can
  // reach past its outline. The outline lies on the edges drawn around the
  // opening, and a clip edge and a drawn edge that coincide are each
  // antialiased against what lies beneath them, which leaves a seam of the
  // layer under the clip targets. A stroke `APERTURE_REACH` screen pixels
  // wide on each side, whatever size the picture is drawn at, moves the
  // mask's edge under the drawn edges, which paint over the targets at rest
  // as the still image draws them. A player drops the stroke whenever the
  // aperture leaves its rest outline: moving edges taper past the opening's
  // corners, and a closed state's drawings may paint beneath the targets, so
  // a reach there would show. A rest outline closed against its entry's
  // widest (a morph that rests closed) has no stroke at all, for the same
  // reason.
  //
  // A non-scaling stroke in a mask is drawn through the space of the element
  // the mask is on, so that element's space is root space: the masked group
  // undoes the transforms around the target and a group inside it redoes
  // them, both written at full precision, and the mask's path is in root
  // space as the apertures are. The path's paint is spelled out, since a
  // mask's content inherits from the mask's ancestors (the artwork root),
  // not from the masked drawing: an inherited `fill-opacity` would make the
  // whole aperture translucent. The mask's region is the apertures' bounds
  // grown by their own size, so it holds the stroke at any size the opening
  // is drawn large enough to see.
  //
  // A browser composes the undoing and redoing matrices in single precision,
  // which moves the target by about 2^-24 times the parent space's
  // stretch one way against another (its condition number) times the size
  // of the coordinates involved, translations included. Where that could
  // exceed `ROOTED_ERROR_FRACTION` of the apertures' extent, the aperture is
  // a clip path in the parent's space, the aperture mapped into it, with no
  // reach.
  //
  // Closure is judged loop by loop (one clip entry may hold several eyes):
  // the open loops are stroked by a second path when some loops are closed.
  const rooted = ({ clip, matrix, space }: Wrapper): boolean => {
    if (isIdentity(matrix)) return true;
    const { minX, minY, maxX, maxY } = apertureBounds[clip]!;
    const size = Math.max(Math.abs(minX), Math.abs(minY), Math.abs(maxX), Math.abs(maxY), ...[matrix, space].flatMap((m) => [Math.abs(m[4]), Math.abs(m[5])]));
    return 2 ** -24 * conditionOf(space) * size <= ROOTED_ERROR_FRACTION * Math.max(maxX - minX, maxY - minY);
  };
  const apertureElement = (wrapper: Wrapper): Element => {
    const { id, clip, matrix } = wrapper;
    const loops = restLoops[clip] ?? [];
    if (!rooted(wrapper)) {
      return {
        tagName: "clipPath",
        attributes: { id, clipPathUnits: "userSpaceOnUse" },
        children: [{ tagName: "path", attributes: { transform: exactAffine(matrix), d: loopsPathData(loops) }, children: [] }],
      };
    }
    const { minX, minY, maxX, maxY, widest } = apertureBounds[clip]!;
    const pad = Math.max(maxX - minX, maxY - minY);
    const open = loops.filter((flat) => loopArea(flat) > CLOSED_FRACTION * widest);
    // Inline, so no style sheet the artwork carries outranks it.
    const path = (d: string, reach: boolean): Element => ({
      tagName: "path",
      attributes: {
        style: `fill:#fff;fill-opacity:1;fill-rule:nonzero;${reach ? `stroke:#fff;stroke-opacity:1;stroke-width:${APERTURE_REACH * 2}px;stroke-dasharray:none;stroke-linejoin:round` : "stroke:none"};visibility:visible;vector-effect:non-scaling-stroke`,
        d,
      },
      children: [],
    });
    const all = open.length === loops.length;
    return {
      tagName: "mask",
      attributes: {
        id,
        maskUnits: "userSpaceOnUse",
        x: `${minX - pad}`,
        y: `${minY - pad}`,
        width: `${maxX - minX + 2 * pad}`,
        height: `${maxY - minY + 2 * pad}`,
      },
      children: [path(loopsPathData(loops), all && open.length > 0), ...(all || !open.length ? [] : [path(loopsPathData(open), true)])],
    };
  };
  const wrap = (element: Element) => (clone: Element): Element => {
    let out = clone;
    for (const wrapper of wrappers.get(element) ?? []) {
      const { id, matrix, space } = wrapper;
      out = !rooted(wrapper)
        ? { tagName: "g", attributes: { "clip-path": `url(#${id})` }, children: [out] }
        : isIdentity(matrix)
          ? { tagName: "g", attributes: { mask: `url(#${id})` }, children: [out] }
          : {
              tagName: "g",
              attributes: { transform: exactAffine(matrix), mask: `url(#${id})` },
              children: [{ tagName: "g", attributes: { transform: exactAffine(space) }, children: [out] }],
            };
    }
    return out;
  };

  // The rest render: the variant's static render with rest apertures applied.
  const rest = (() => {
    const root = cloneElement(doc.root, false);
    const copy = (element: Element, into: Element) => {
      for (const child of element.children) {
        if (!child || typeof child !== "object") {
          into.children.push(child);
          continue;
        }
        const entry = doc!.info.get(child);
        if (entry?.key !== undefined && !restVisible[entry.key]) continue;
        const clone = cloneElement(child, false);
        copy(child, clone);
        into.children.push(wrappers.has(child) ? wrap(child)(clone) : clone);
      }
    };
    copy(doc.root, root);
    const defs: Element = { tagName: "defs", attributes: {}, children: [] };
    for (const [, list] of wrappers) for (const w of list) defs.children.push(apertureElement(w));
    if (defs.children.length) root.children.unshift(defs);
    return serialize(root);
  })();

  // Ordered parts: maximal runs of static or live leaves in paint order.
  const runs: { live: boolean; leaves: Leaf[] }[] = [];
  for (const leaf of leaves) {
    const last = runs[runs.length - 1];
    if (last && last.live === leaf.live) last.leaves.push(leaf);
    else runs.push({ live: leaf.live, leaves: [leaf] });
  }
  // A drawing drawn again by reference (`<use href="#portrait">`, or a clip
  // path that uses it) has to be whole wherever it is referenced, and move
  // where the original moves. The references are every dependency the part
  // carries, its kept ancestors' included. A drawing
  // that never changes and lies wholly in other parts is copied whole. One
  // that holds leaves of the referencing part and of another is kept there
  // only in part (no part can carry it whole without repeating ids it already
  // holds), and a copy of a changing drawing in another part would stand
  // still while the original moves; either way the variant keeps its static
  // render. So does a reference to a drawing that moves on a carrier: the
  // drawing itself is hidden while its frames draw on the copy, and the
  // reference names the drawing.
  for (const id of carriers.size ? partClosure(doc, leaves.map((leaf) => leaf.element)) : []) {
    const target = doc.byId.get(id)!;
    const carried = drawnLeaves(doc, target).some((element) => {
      const leaf = leafOf.get(element);
      return !!leaf && carriers.has(leaf);
    });
    if (!carried) continue;
    report(
      "unsupported-element",
      "error",
      `"${id}" is drawn again by reference, but the morph moves it on a copy the reference cannot follow, so this variant shows without the morph.`,
      { ...(keyOf(target) === undefined ? {} : { path: keyOf(target)! }) },
    );
    return disable();
  }
  if (runs.length > 1) {
    const runOf = new Map<Element, number>();
    runs.forEach((run, index) => run.leaves.forEach((leaf) => runOf.set(leaf.element, index)));
    for (const [index, run] of runs.entries()) {
      for (const id of partClosure(doc, run.leaves.map((leaf) => leaf.element))) {
        const target = doc.byId.get(id)!;
        const drawn = drawnLeaves(doc, target).filter((leaf) => runOf.has(leaf));
        const parts = new Set(drawn.map((leaf) => runOf.get(leaf)!));
        const split = parts.has(index) && parts.size > 1;
        const stillCopy = drawn.some((leaf) => moving.has(leaf) && runOf.get(leaf) !== index);
        if (split || stillCopy) {
          report(
            "unsupported-element",
            "error",
            `"${id}" is drawn again by reference, but the morph would ${split ? "split it between parts" : "leave that copy standing still"}, so this variant shows without the morph.`,
            { ...(keyOf(target) === undefined ? {} : { path: keyOf(target)! }) },
          );
          return disable();
        }
      }
    }
  }
  const missing = new Set<string>();
  const parts: MorphPart[] = runs.map((run) => {
    const keep = new Set(run.leaves.map((l) => l.element));
    const extra = new Map<Element, (clone: Element) => Element>();
    const used: Wrapper[] = [];
    if (run.live) {
      for (const leaf of run.leaves) {
        extra.set(leaf.element, (clone) => {
          clone.attributes["data-morph"] = leaf.node;
          // The markup is the rest pose: the parts composed as written are
          // the rest render, and a player shows other states' drawings by
          // taking the inline `display: none` off. Nothing outranks it: art
          // baked live carries no style sheet, and a drawn leaf's own
          // `display` can only be a showing one (hidden art is no leaf), so
          // it goes.
          delete clone.attributes["display"];
          setStyleProperty(clone, "display", visibleAt(leaf.element, restVisible) ? undefined : "none");
          const place = (element: Element) => (wrappers.has(leaf.element) ? wrap(leaf.element)(element) : element);
          const copies = carriers.get(leaf) ?? [];
          if (!copies.length) return place(clone);
          // Carriers paint right after the drawing they copy, hidden until a
          // track draws on them, and with no ids of their own.
          return {
            tagName: "g",
            attributes: {},
            children: [
              place(clone),
              ...copies.map((node) => {
                const copy = cloneElement(clone);
                const unnamed = (element: Element) => {
                  delete element.attributes["id"];
                  for (const child of element.children) if (child && typeof child === "object") unnamed(child);
                };
                unnamed(copy);
                if (!isPath(leaf)) convertToPath(copy, pathData(localGeometry(leaf.element) ?? []));
                copy.attributes["data-morph"] = node;
                setStyleProperty(copy, "display", "none");
                return place(copy);
              }),
            ],
          };
        });
      }
      for (const [target, list] of wrappers) {
        if (!run.leaves.some((l) => isAncestorOrSelf(doc!, target, l.element))) continue;
        used.push(...list);
        const prior = extra.get(target);
        if (!prior) extra.set(target, wrap(target));
      }
    }
    const { root, ids } = extractTree(doc!, keep, { extra, missing });
    if (used.length) {
      const defs: Element = { tagName: "defs", attributes: {}, children: used.map((w) => apertureElement(w)) };
      root.children.unshift(defs);
      for (const w of used) ids.add(w.id);
    }
    namespaceTree(root, prefix, ids);
    return { kind: run.live ? "live" : "static", svg: serialize(root) };
  });
  for (const id of missing) {
    report("resource-missing", "warning", `The artwork refers to \`#${id}\`, which it does not define.`);
  }

  const visibility: MorphArtifact["visibility"] = table();
  const scheduleOut: MorphArtifact["schedules"] = table();
  for (const [group, entries] of schedules) {
    const byState = visibleIn.get(group)!;
    const states: Record<string, string[]> = table();
    for (const [state, visible] of byState) {
      states[state || restName(group)] = leaves
        .filter((l) => l.live && l.group === group && visibleAt(l.element, visible))
        .map(nodeOf);
    }
    visibility[group] = states;
    scheduleOut[group] = entries.map((e) => ({ offset: e.offset, state: e.state === REST ? restName(group) : e.state }));
  }

  const root = doc.root.attributes;
  return {
    format: MORPH_BAKE_FORMAT,
    key: input.key,
    morph: recipe.name,
    ...(input.variant === undefined ? {} : { variant: input.variant }),
    status: "live",
    ...(root["viewBox"] === undefined ? {} : { viewBox: root["viewBox"] }),
    ...(root["width"] === undefined ? {} : { width: root["width"] }),
    ...(root["height"] === undefined ? {} : { height: root["height"] }),
    rest,
    idPrefix: prefix,
    parts,
    visibility,
    schedules: scheduleOut,
    segments,
    frames,
    apertures,
    clipTargets,
    diagnostics,
  };
}

/** Runs a bake to completion on the calling thread. */
export function bakeMorphArtifact(input: MorphBakeInput, options?: MorphBakeOptions): MorphArtifact {
  const steps = bakeSteps(input, options);
  for (;;) {
    const next = steps.next();
    if (next.done) return next.value;
  }
}

const macrotask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Runs a bake, yielding to the host between drawings. An aborted signal
 * stops it at the next yield with the signal's reason.
 */
export async function bakeMorphArtifactAsync(
  input: MorphBakeInput,
  options: MorphBakeOptions & { signal?: AbortSignal; yieldEvery?: number } = {},
): Promise<MorphArtifact> {
  const steps = bakeSteps(input, options);
  const every = Math.max(1, options.yieldEvery ?? 4);
  let count = 0;
  for (;;) {
    options.signal?.throwIfAborted();
    const next = steps.next();
    if (next.done) return next.value;
    if (++count % every === 0) await macrotask();
  }
}
