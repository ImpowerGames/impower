import { formatColor, readEntryColor } from "./color";
import { own, table } from "./own";
import { normalizeMorphKeyframes } from "../compiler/morph/normalizeMorphKeyframes";
import {
  MORPH_BLENDS,
  MORPH_FALLBACKS,
  MORPH_DEPTH_REST,
  MORPH_METHODS,
  MORPH_PAINT_SPAN_DEFAULT,
  parseMorphDepth,
  parseMorphQualifiedState,
  parseMorphSpan,
} from "../compiler/morph/morphSchema";
import type {
  MorphBlend,
  MorphFallback,
  MorphMethodName,
  MorphPaintEntry,
  MorphPolicy,
  MorphRecipe,
} from "./types";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === "object" && !Array.isArray(value);

const oneOf = <T extends string>(values: readonly T[], value: unknown): T | undefined =>
  typeof value === "string" && (values as readonly string[]).includes(value) ? (value as T) : undefined;

const policyOf = (struct: Record<string, unknown>): MorphPolicy => {
  const policy: MorphPolicy = {};
  const blend = oneOf<MorphBlend>(MORPH_BLENDS, struct["blend"]);
  const method = oneOf<MorphMethodName>(MORPH_METHODS, struct["method"]);
  const fallback = oneOf<MorphFallback>(MORPH_FALLBACKS, struct["fallback"]);
  if (blend) policy.blend = blend;
  if (method) policy.method = method;
  if (fallback) policy.fallback = fallback;
  if (parseMorphDepth(struct["depth"])) policy.depth = struct["depth"] as string;
  return policy;
};

const labels = (list: unknown): string[] =>
  Array.isArray(list) ? list.filter((v): v is string => typeof v === "string" && v !== "") : [];

/**
 * A `paints` entry's bake inputs, its colours written as `formatColor`
 * writes them; undefined for an entry with a value the checks reject.
 */
const paintEntryOf = (entry: Record<string, unknown>): MorphPaintEntry | undefined => {
  const targets = labels(entry["targets"]);
  const state = entry["state"];
  const when = entry["when"];
  const span = entry["span"] === undefined ? MORPH_PAINT_SPAN_DEFAULT : parseMorphSpan(entry["span"]);
  if (!targets.length || !parseMorphQualifiedState(state) || span === undefined) return undefined;
  if (when !== undefined && !parseMorphQualifiedState(when)) return undefined;
  const out: MorphPaintEntry = { targets, state: state as string, ...(when === undefined ? {} : { when: when as string }), span };
  for (const name of ["fill", "stroke"] as const) {
    if (entry[name] === undefined) continue;
    const color = readEntryColor(entry[name]);
    if (!color) return undefined;
    out[name] = formatColor(color);
  }
  return out.fill || out.stroke ? out : undefined;
};

/**
 * The bake inputs of an effective morph (the builtin defaults, then every
 * ancestor, then its own body). Values the declaration checks reject are
 * dropped here rather than guessed at; the block already reports them.
 */
export function buildMorphRecipe(name: string, morph: Record<string, unknown>): MorphRecipe {
  const root = policyOf(morph);
  const layers: Record<string, MorphPolicy> = table();
  if (isRecord(morph["layers"])) {
    for (const label of Object.keys(morph["layers"]).sort()) {
      const entry = morph["layers"][label];
      if (!isRecord(entry)) continue;
      const policy = policyOf(entry);
      if (Object.keys(policy).length > 0) layers[label] = policy;
    }
  }
  const keyframes: MorphRecipe["keyframes"] = [];
  if (Array.isArray(morph["keyframes"])) {
    const normalized = normalizeMorphKeyframes(morph["keyframes"])
      .map((frame, index) => ({ frame, index }))
      .sort(
        (a, b) =>
          (a.frame["offset"] as number) - (b.frame["offset"] as number) || a.index - b.index,
      );
    for (const { frame } of normalized) {
      const states: Record<string, string> = table();
      for (const key of Object.keys(frame).sort()) {
        const container = frame[key];
        if (key === "offset" || !isRecord(container)) continue;
        const state = container["state"];
        if (typeof state === "string" && state && !state.includes(".")) states[key] = state;
      }
      const offset = frame["offset"];
      keyframes.push({ offset: typeof offset === "number" ? offset : 0, states });
    }
  }
  const clips: MorphRecipe["clips"] = [];
  if (Array.isArray(morph["clips"])) {
    for (const clip of morph["clips"]) {
      if (!isRecord(clip)) continue;
      const between = labels(clip["between"]);
      const targets = labels(clip["targets"]);
      if (between.length && targets.length) clips.push({ between, targets });
    }
  }
  // An entry's pose is a state the keyframes name for a group they drive,
  // other than the one it starts from, and its condition is on a group they
  // do not drive.
  const named = new Map<string, Set<string>>();
  for (const keyframe of keyframes) {
    for (const [group, state] of Object.entries(keyframe.states)) named.set(group, (named.get(group) ?? new Set()).add(state));
  }
  const paints: MorphPaintEntry[] = [];
  if (Array.isArray(morph["paints"])) {
    for (const entry of morph["paints"]) {
      const paint = isRecord(entry) ? paintEntryOf(entry) : undefined;
      const pose = paint && parseMorphQualifiedState(paint.state)!;
      const when = paint?.when === undefined ? undefined : parseMorphQualifiedState(paint.when)!;
      if (!paint || !pose || !named.get(pose.group)?.has(pose.state) || own(keyframes[0]?.states ?? {}, pose.group) === pose.state) continue;
      if (when && named.has(when.group)) continue;
      paints.push(paint);
    }
  }
  return {
    name,
    blend: root.blend ?? "morph",
    ...(root.method ? { method: root.method } : {}),
    fallback: root.fallback ?? "fade",
    // The default is left out, so a morph that keeps it bakes under the
    // recipe text it had before `depth` existed.
    ...(root.depth && root.depth !== MORPH_DEPTH_REST ? { depth: root.depth } : {}),
    layers,
    keyframes,
    clips,
    // Left out when empty, as `depth` is at its default.
    ...(paints.length ? { paints } : {}),
  };
}

/** The groups a recipe drives, in first-mention order. */
export function recipeGroups(recipe: MorphRecipe): string[] {
  const groups: string[] = [];
  for (const keyframe of recipe.keyframes) {
    for (const group of Object.keys(keyframe.states)) {
      if (!groups.includes(group)) groups.push(group);
    }
  }
  return groups;
}

/**
 * The recipe in the shape `morphRequirements` and `bindMorph` read, so binding
 * during a bake applies exactly the rules compilation applied.
 */
export function recipeAsMorph(recipe: MorphRecipe): Record<string, unknown> {
  return {
    keyframes: recipe.keyframes.map((k) => {
      const frame: Record<string, unknown> = { offset: k.offset };
      for (const [group, state] of Object.entries(k.states)) frame[group] = { state };
      return frame;
    }),
    layers: recipe.layers,
    clips: recipe.clips,
  };
}

/**
 * Canonical JSON: the same recipe always serializes to the same text, so the
 * text can key caches and travel in URLs.
 */
export function serializeMorphRecipe(recipe: MorphRecipe): string {
  return JSON.stringify(recipe);
}

/** Parses recipe text, or returns undefined when it is not a recipe. */
export function parseMorphRecipe(text: string): MorphRecipe | undefined {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!isRecord(value) || typeof value["name"] !== "string") return undefined;
  const recipe = buildMorphRecipe(value["name"], {
    ...value,
    keyframes: Array.isArray(value["keyframes"])
      ? value["keyframes"].map((k) => {
          if (!isRecord(k)) return {};
          const frame: Record<string, unknown> = { offset: k["offset"] };
          if (isRecord(k["states"])) {
            for (const [group, state] of Object.entries(k["states"])) frame[group] = { state };
          }
          return frame;
        })
      : [],
  });
  // Text that does not survive a round trip unchanged was not written by
  // `serializeMorphRecipe`; refusing it keeps one recipe to one cache key.
  return serializeMorphRecipe(recipe) === text ? recipe : undefined;
}
