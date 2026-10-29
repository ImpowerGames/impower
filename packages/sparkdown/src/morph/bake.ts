import {
  buildApertures,
  morphScale,
  morphSubpaths,
  pairShapes,
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
import { MORPH_DEPTH_REST, parseMorphDepth, parseMorphQualifiedState } from "../compiler/morph/morphSchema";
import {
  applySubpaths,
  invert,
  isIdentity,
  multiply,
  parseTransform,
  type Affine,
} from "./affine";
import { readEntryColor } from "./color";
import { gradientCopy, gradientNumbers, gradientsMatch, readGradient } from "./gradient";
import { hashText } from "./hash";
import { own, table } from "./own";
import { effectivePaint, paintBlend, type EffectivePaint } from "./paint";
import { recipeAsMorph } from "./recipe";
import { APERTURE_REACH_ID_SUFFIX, APERTURE_REACH_STROKE } from "./render";
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
  subtree,
  unreadableGeometry,
  unreadableStyle,
  type ArtDocument,
  type Element,
} from "./svgDocument";
import {
  MORPH_BAKE_FORMAT,
  type MorphArtifact,
  type MorphBakeDiagnostic,
  type MorphBlend,
  type MorphClipFrames,
  type MorphClipTarget,
  type MorphColor,
  type MorphFallback,
  type MorphFrames,
  type MorphGeometryRef,
  type MorphGradient,
  type MorphGradientBlend,
  type MorphMethodName,
  type MorphPaintBase,
  type MorphPaintPose,
  type MorphPart,
  type MorphRecipe,
  type MorphSegment,
  type MorphTransition,
} from "./types";

export const MORPH_BAKE_SAMPLES = 8;
const PRECISION = 1000;
const round = (n: number) => Math.round(n * PRECISION) / PRECISION || 0;

export interface MorphBakeInput {
  source: string;
  selection: AttributeSelection;
  recipe: MorphRecipe;
  key: string;
  variant?: string;
  uri?: string;
}

export type MorphGeometryEntry = MorphResult | MorphFrames | { samples: number[][][]; edges: number[][][][]; loopKeys: string[][] };

export interface MorphGeometryCache {
  get(key: string): MorphGeometryEntry | undefined;
  set(key: string, value: MorphGeometryEntry): void;
}

export interface MorphBakeOptions {
  geometry?: MorphGeometryCache;
}

type Rest = typeof REST;
const REST = Symbol("rest");

interface Wrapper {
  clip: number;
  id: string;
  matrix: Affine;
  space: Affine;
}

const exactAffine = (m: Affine) => `matrix(${m.join(" ")})`;

interface Leaf {
  element: Element;
  node: string;
  key: string;
  label: string;
  group?: string;
  live: boolean;
}

function staticArtifact(
  input: MorphBakeInput,
  text: string,
  diagnostics: MorphBakeDiagnostic[],
): MorphArtifact {
  let rest = text;
  try {
    rest = filterSVGAttributes(text, input.selection);
  } catch {
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
    apertureEdges: [],
    clipTargets: [],
    diagnostics,
  };
}

export const idPrefixFor = (key: string) => `_m${hashText(key).slice(0, 8)}_`;

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

function loopArea(flat: number[]): number {
  let twice = 0;
  for (let i = 0; i + 1 < flat.length; i += 2) {
    const j = (i + 2) % flat.length;
    twice += flat[i]! * flat[j + 1]! - flat[j]! * flat[i + 1]!;
  }
  return Math.abs(twice) / 2;
}

function conditionOf(m: Affine): number {
  const [a, b, c, d] = m;
  const sum = a * a + b * b + c * c + d * d;
  const det = Math.abs(a * d - b * c);
  const root = Math.sqrt(Math.max(0, sum * sum - 4 * det * det));
  const least = Math.sqrt(Math.max(0, (sum - root) / 2));
  return least > 0 ? Math.sqrt((sum + root) / 2) / least : Infinity;
}

const CLOSED_FRACTION = 0.01;

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

  if (doc.styleSheet) {
    report(
      "unsupported-element",
      "error",
      `This artwork carries a style sheet (\`${doc.styleSheet}\`), whose rules the bake does not read, so this variant shows without the morph. Inline \`style\` attributes and presentation attributes are read.`,
    );
    return disable();
  }
  for (const element of subtree(doc.root)) {
    const unreadable = unreadableStyle(element);
    if (unreadable === undefined) continue;
    const id = element.attributes["id"];
    const key = doc.info.get(element)?.key;
    const label = effectiveLabel(doc, element);
    report(
      "unsupported-element",
      "error",
      `\`<${element.tagName}${id === undefined ? "" : ` id="${id}"`}>\`${label ? ` in layer "${label}"` : ""} has a style the bake cannot read safely (\`${unreadable}\`), so this variant shows without the morph. The bake reads inline styles in plain ASCII, without \`all\`, \`var()\`, comments, escapes, character references or strings, and opacity as a number or a percentage.`,
      { ...(label ? { layer: label } : {}), ...(key === undefined ? {} : { path: key }) },
    );
    return disable();
  }
  for (const element of subtree(doc.root)) {
    const transform = element.attributes["transform"];
    if (transform === undefined || parseTransform(transform)) continue;
    const id = element.attributes["id"];
    const key = doc.info.get(element)?.key;
    const label = effectiveLabel(doc, element);
    report(
      "unsupported-transform",
      "error",
      `\`<${element.tagName}${id === undefined ? "" : ` id="${id}"`}>\`${label ? ` in layer "${label}"` : ""} has a \`transform\` attribute the bake cannot read safely (\`${transform}\`), so this variant shows without the morph. The bake reads the six transform functions with plain numbers, separated by space, tab, line breaks or a comma.`,
      { ...(label ? { layer: label } : {}), ...(key === undefined ? {} : { path: key }) },
    );
    return disable();
  }

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
  const labelledAny = (element: Element, labels: readonly string[]) =>
    [...ancestry(doc!, element)].some((entry) => {
      const label = entry.layer?.parsed.label;
      return !!label && labels.includes(label);
    });
  const needs = (element: Element, group: string, state: string) =>
    [...ancestry(doc!, element)].some((entry) =>
      entry.layer?.parsed.conditions.some(
        (c) => c.group === group && c.options.length > 0 && c.options.every((o) => o === state || o.startsWith(`${state}-`)),
      ),
    );
  const restDrawn = allLeaves.filter((element) => visibleAt(element, restVisible));
  const appliedPaints = (recipe.paints ?? []).flatMap((entry, index) => {
    const pose = parseMorphQualifiedState(entry.state);
    const visible = pose && pose.state !== requirements.rest.get(pose.group) ? visibleIn.get(pose.group)?.get(pose.state) : undefined;
    if (!pose || !visible) return [];
    if (entry.when !== undefined) {
      const when = parseMorphQualifiedState(entry.when);
      if (!when || !restDrawn.some((element) => needs(element, when.group, when.state))) return [];
    }
    return [{ entry, index, pose, visible }];
  });
  const live = new Set<Element>();
  for (const element of allLeaves) {
    const key = keyOf(element);
    if ((key !== undefined && groupOf.has(key)) || inTarget(element)) live.add(element);
    else if (appliedPaints.some(({ entry, visible }) => visibleAt(element, visible) && labelledAny(element, entry.targets))) live.add(element);
  }
  const moving = new Set(live);
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
  const carriers = new Map<Leaf, string[]>();
  const carrierOf = (leaf: Leaf, index: number): string => {
    const list = carriers.get(leaf) ?? [];
    while (list.length <= index) list.push(`n${nodeCount++}`);
    carriers.set(leaf, list);
    return list[index]!;
  };

  const policy = <F extends "blend" | "method" | "fallback">(leaf: Leaf, field: F): MorphRecipe[F] => {
    for (const entry of ancestry(doc!, leaf.element)) {
      const label = entry.layer?.parsed.label;
      const value = label ? own(recipe.layers, label)?.[field] : undefined;
      if (value) return value as MorphRecipe[F];
    }
    return recipe[field];
  };
  const depthOf = (leaf: Leaf): { depth: string; label?: string } => {
    for (const entry of ancestry(doc!, leaf.element)) {
      const label = entry.layer?.parsed.label;
      const depth = label ? own(recipe.layers, label)?.depth : undefined;
      if (depth) return { depth, label };
    }
    return { depth: recipe.depth ?? MORPH_DEPTH_REST };
  };
  const depthPose = (depth: string, group: string): Record<string, boolean> | undefined => {
    const pose = parseMorphDepth(depth);
    if (!pose || pose === MORPH_DEPTH_REST) return restVisible;
    if (pose.group !== group) return undefined;
    if (pose.state === requirements.rest.get(group)) return restVisible;
    return visibleIn.get(group)?.get(pose.state);
  };
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
  const paintPosesOf = (): MorphPaintPose[] => {
    const out: MorphPaintPose[] = [];
    const leafByNode = new Map(leaves.filter((l) => l.live).map((l) => [l.node, l]));
    for (const { entry, index, pose, visible } of appliedPaints) {
      const drawn = leaves.filter(
        (l) => l.live && (l.group === pose.group || l.group === undefined) && visibleAt(l.element, visible) && labelledAny(l.element, entry.targets),
      );
      for (const label of entry.targets) {
        if (drawn.some((l) => labelledAny(l.element, [label]))) continue;
        report(
          "paint-target-missing",
          "warning",
          `\`paints\` entry ${index + 1} recolours "${label}" at \`${entry.state}\`, but that pose draws no "${label}", so nothing of it takes the colour.`,
          { layer: label },
        );
      }
      if (!drawn.length) continue;
      const colors: ["fill" | "stroke", MorphColor][] = [];
      for (const name of ["fill", "stroke"] as const) {
        const color = entry[name] === undefined ? undefined : readEntryColor(entry[name]);
        if (color) colors.push([name, color]);
      }
      const ownColor = (paint: EffectivePaint, name: "fill" | "stroke", color: MorphColor): MorphColor | undefined => {
        const value = paint[name];
        return value === "none" ? [color[0], color[1], color[2], 0] : value;
      };
      const nodes: Record<string, MorphPaintBase> = table();
      for (const leaf of drawn) {
        const base: MorphPaintBase = {};
        for (const [name, color] of colors) {
          const value = ownColor(paintOf(leaf), name, color);
          if (value) base[name] = value;
        }
        nodes[leaf.node] = base;
      }
      const tracks: MorphPaintPose["tracks"] = [];
      segments.forEach((segment, s) => {
        if (segment.group !== pose.group) return;
        const arriving = segment.to.state === pose.state;
        const leaving = segment.from.state === pose.state;
        for (const t of segment.transitions) {
          if (t.kind !== "morph" || !((arriving && t.to in nodes) || (leaving && t.from in nodes))) continue;
          const ends: MorphPaintPose["tracks"][number]["ends"] = {};
          for (const [name, color] of colors) {
            const recorded = t.paint?.[name];
            const a = recorded?.[0] ?? ownColor(paintOf(leafByNode.get(t.from)!), name, color);
            const b = recorded?.[1] ?? ownColor(paintOf(leafByNode.get(t.to)!), name, color);
            if (a && b) ends[name] = [a, b];
          }
          tracks.push({ segment: s, draw: t.draw, ends });
        }
      });
      out.push({
        group: pose.group,
        state: pose.state,
        span: entry.span,
        ...Object.fromEntries(colors),
        nodes,
        tracks,
      });
    }
    return out;
  };
  const depthUse = new Map<string, { label: string; depth: string; groups: Set<string>; used: boolean }>();

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
  const paints = new Map<Leaf, EffectivePaint>();
  const paintOf = (leaf: Leaf): EffectivePaint => {
    let paint = paints.get(leaf);
    if (!paint) paints.set(leaf, (paint = effectivePaint(doc!, leaf.element)));
    return paint;
  };
  const elementSpace = (leaf: Leaf): Affine | null => {
    const m = doc!.info.get(leaf.element)?.rootFromElement;
    return m ? invert(m) : null;
  };
  const prefix = idPrefixFor(input.key);
  const gradientsRead = new Map<string, MorphGradient | undefined>();
  const gradientOf = (id: string): MorphGradient | undefined => {
    if (!gradientsRead.has(id)) gradientsRead.set(id, readGradient(doc!, id));
    return gradientsRead.get(id);
  };
  const gradientIn = (leaf: Leaf, name: "fill" | "stroke", space: Affine): MorphGradient | undefined => {
    const id = paintOf(leaf).server[name];
    const gradient = id === undefined ? undefined : gradientOf(id);
    const from = doc!.info.get(leaf.element)?.rootFromElement;
    if (!gradient || !from) return undefined;
    if (gradient.units === "objectBoundingBox") return gradient;
    const fine = (n: number) => Number(n.toPrecision(12)) || 0;
    const transform = multiply(multiply(space, from), gradient.transform as Affine).map(fine);
    return gradientNumbers(transform) ? { ...gradient, transform } : undefined;
  };
  const gradientCopies = new Map<string, { id: string; home: Leaf; gradient: MorphGradient }>();
  let gradientSerial = 0;
  const gradientBlends = (from: Leaf, to: Leaf, home: Leaf, draw: string, space: Affine) => {
    const out: { fill?: MorphGradientBlend; stroke?: MorphGradientBlend } = {};
    const matched = { fill: false, stroke: false };
    for (const name of ["fill", "stroke"] as const) {
      const a = gradientIn(from, name, space);
      const b = gradientIn(to, name, space);
      if (!a || !b || !gradientsMatch(a, b)) continue;
      matched[name] = true;
      const same = (x: MorphGradient | undefined) => JSON.stringify(x) === JSON.stringify(a);
      if (same(b) && same(gradientIn(home, name, space))) continue;
      const key = `${draw}:${name}:${a.kind}:${a.units}:${a.spread}:${a.stops.length}`;
      let copy = gradientCopies.get(key);
      if (!copy) {
        let id = `morph-gradient-${gradientSerial++}`;
        while (doc!.byId.has(id)) id = `morph-gradient-${gradientSerial++}`;
        copy = { id, home, gradient: a };
        gradientCopies.set(key, copy);
      }
      out[name] = { id: `${prefix}${copy.id}`, ends: [a, b] };
    }
    return { gradients: out, matched };
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
        { layer: from.label, path: cacheKey.slice(0, cacheKey.indexOf(">")) },
      );
      return { morph: null, cacheKey, reversed };
    }
    return { morph: result.morph, cacheKey, reversed };
  };

  const segments: MorphSegment[] = [];
  const apertures: number[][][][] = [];
  const apertureEdges: number[][][][][] = [];
  const apertureLoopKeys: string[][][] = [];
  const edgeHomes = new Map<MorphClipFrames, Map<string, Leaf>>();
  const apertureIndex = new Map<string, number>();
  const restLoops: (number[][] | undefined)[] = recipe.clips.map(() => undefined);
  const clipHasFrames = recipe.clips.map(() => false);

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
      const edgeTracks = new Map<number, { edges: EdgeTrack[]; keys: string[]; homes: Leaf[]; reversedAll: boolean; forwardAll: boolean }>();
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
        const [fewer, more] = [d.fromCount, d.toCount].sort((a, b) => a - b);
        report("pairing-count", "warning", `"${d.label}" has ${fewer} drawings in one pose and ${more} in the other; neither is a single drawing, so they cannot pair and each uses its fallback.`, { layer: d.label });
      }
      for (const u of pairing.unpaired) (u.side === "from" ? unpairedFrom : unpairedTo).push(byNode.get(u.shape.id)!);
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
        const { gradients, matched } = gradientBlends(from, to, home, draw, space);
        const paint = paintBlend(paintOf(from), paintOf(to), paintOf(home), matched);
        transitions.push({
          kind: "morph",
          from: nodeOf(from),
          to: nodeOf(to),
          draw,
          shared: pair.shared,
          frames: ref,
          ...(paint ? { paint } : {}),
          ...(gradients.fill || gradients.stroke ? { gradients } : {}),
        });
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
          const entry = edgeTracks.get(clipIndex) ?? { edges: [], keys: [], homes: [], reversedAll: true, forwardAll: true };
          entry.edges.push({ id: pair.trackId, label: from.label, track: reversed ? reversedBend(track) : track });
          entry.keys.push(cacheKey);
          entry.homes.push(home);
          if (reversed) entry.forwardAll = false;
          else entry.reversedAll = false;
          edgeTracks.set(clipIndex, entry);
          edgeNodes.add(from.node).add(to.node);
        }
      }
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
            const slots = homed.get(leaf) ?? { node: false, carriers: 0 };
            homed.set(leaf, slots);
            const draw = isPath(leaf) ? nodeOf(leaf) : carrierOf(leaf, slots.carriers++);
            transitions.push({ kind: "scale", node: nodeOf(leaf), draw, direction, frames: ref });
            return;
          }
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
        const known = canonical
          ? (geometryCache.get(`aperture:${signature}`) as { samples: number[][][]; edges: number[][][][]; loopKeys: string[][] } | undefined)
          : undefined;
        if (reuse !== undefined && canonical) {
          ref = { index: reuse, reversed: entry.reversedAll && !entry.forwardAll };
        } else if (known) {
          apertures.push(known.samples);
          apertureEdges.push(known.edges);
          apertureLoopKeys.push(known.loopKeys);
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
          const edges: number[][][][] = [];
          for (let s = 0; s < MORPH_BAKE_SAMPLES; s++) {
            const t = s / (MORPH_BAKE_SAMPLES - 1);
            raw.push(built.apertures.map((ap) => ap.loop(t)));
            edges.push(built.apertures.map((ap) => ap.bands(t).map((band) => band.flatMap(([x, y]) => [round(x), round(y)]))));
          }
          const samples: number[][][] = raw.map((loops) =>
            loops.map((loop, j) => {
              const points = Math.max(...raw.map((other) => other[j]!.length));
              return resampleLoop(loop, points).flatMap(([x, y]) => [round(x), round(y)]);
            }),
          );
          const reversed = entry.reversedAll && !entry.forwardAll;
          if (reversed) {
            samples.reverse();
            edges.reverse();
          }
          const loopKeys = built.apertures.map((ap) => ap.edgeIds.map((id) => entry.keys[entry.edges.findIndex((edge) => edge.id === id)]!));
          apertures.push(samples);
          apertureEdges.push(edges);
          apertureLoopKeys.push(loopKeys);
          ref = { index: apertures.length - 1, reversed };
          if (canonical) {
            apertureIndex.set(signature, apertures.length - 1);
            geometryCache.set(`aperture:${signature}`, { samples, edges, loopKeys });
          }
        }
        const frames: MorphClipFrames = { clip: clipIndex, loops: ref };
        clips.push(frames);
        edgeHomes.set(frames, new Map(entry.keys.map((key, k) => [key, entry.homes[k]!])));
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

  const clipTargets: MorphClipTarget[] = [];
  const targetOf = new Map<string, Element>();
  const wrappers = new Map<Element, Wrapper[]>();
  let clipSerial = 0;
  const freshId = (base: string) => {
    let id = base;
    while (doc!.byId.has(id) || doc!.byId.has(`${id}${APERTURE_REACH_ID_SUFFIX}`)) id = `${base}-${++clipSerial}`;
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
      targetOf.set(`${prefix}${id}`, target);
    }
  }
  const paintIndex = new Map(leaves.map((leaf, index) => [leaf.element, index]));
  const lastPainted = (target: Element) =>
    Math.max(-1, ...leaves.filter((leaf) => isAncestorOrSelf(doc!, target, leaf.element)).map((leaf) => paintIndex.get(leaf.element)!));
  for (const segment of segments) {
    for (const frames of segment.clips) {
      const homes = edgeHomes.get(frames) ?? new Map<string, Leaf>();
      const loopKeys = apertureLoopKeys[frames.loops.index] ?? [];
      const reach: { aperture: string; loops: number[] }[] = [];
      for (const { clip, aperture } of clipTargets) {
        if (clip !== frames.clip) continue;
        const last = lastPainted(targetOf.get(aperture)!);
        const above = (key: string) => {
          const home = homes.get(key);
          return !!home && paintIndex.get(home.element)! > last;
        };
        const loops = loopKeys.flatMap((keys, j) => (keys.length > 0 && keys.every(above) ? [j] : []));
        if (loops.length) reach.push({ aperture, loops });
      }
      if (reach.length) frames.reach = reach;
    }
  }
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
    const path = (d: string, reach: boolean): Element => ({
      tagName: "path",
      attributes: {
        style: `fill:#fff;fill-opacity:1;fill-rule:nonzero;${reach ? APERTURE_REACH_STROKE.map(([name, value]) => `${name}:${value}`).join(";") : "stroke:none"};visibility:visible;vector-effect:non-scaling-stroke`,
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

  const runs: { live: boolean; leaves: Leaf[] }[] = [];
  for (const leaf of leaves) {
    const last = runs[runs.length - 1];
    if (last && last.live === leaf.live) last.leaves.push(leaf);
    else runs.push({ live: leaf.live, leaves: [leaf] });
  }
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
          delete clone.attributes["display"];
          setStyleProperty(clone, "display", visibleAt(leaf.element, restVisible) ? undefined : "none");
          const place = (element: Element) => (wrappers.has(leaf.element) ? wrap(leaf.element)(element) : element);
          const copies = carriers.get(leaf) ?? [];
          if (!copies.length) return place(clone);
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
    const copies = run.live ? [...gradientCopies.values()].filter((copy) => keep.has(copy.home.element)) : [];
    if (used.length || copies.length) {
      const defs: Element = {
        tagName: "defs",
        attributes: {},
        children: [...used.map((w) => apertureElement(w)), ...copies.map((copy) => gradientCopy(copy.id, copy.gradient))],
      };
      root.children.unshift(defs);
      for (const w of used) ids.add(w.id);
      for (const copy of copies) ids.add(copy.id);
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

  const paintPoses = paintPosesOf();
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
    apertureEdges,
    clipTargets,
    ...(paintPoses.length ? { paints: paintPoses } : {}),
    diagnostics,
  };
}

export function bakeMorphArtifact(input: MorphBakeInput, options?: MorphBakeOptions): MorphArtifact {
  const steps = bakeSteps(input, options);
  for (;;) {
    const next = steps.next();
    if (next.done) return next.value;
  }
}

const macrotask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

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
