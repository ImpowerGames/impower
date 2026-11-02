import { formatColor, readEntryColor } from "./color";
import { own, table } from "./own";
import { normalizeMorphKeyframes } from "../compiler/morph/normalizeMorphKeyframes";
import {
  MORPH_BLENDS,
  MORPH_CLIP_SPREAD_DEFAULT,
  MORPH_FALLBACKS,
  MORPH_DEPTH_REST,
  MORPH_METHODS,
  MORPH_PAINT_SPAN_DEFAULT,
  parseMorphDepth,
  parseMorphPartner,
  parseMorphQualifiedState,
  parseMorphSpan,
  parseMorphSpread,
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

const partnerOf = (label: string, entry: Record<string, unknown>, edges: ReadonlySet<string>): string[] | undefined => {
  const list = parseMorphPartner(entry["partner"]);
  if (!list || edges.has(label)) return undefined;
  const distinct = [...new Set(list)];
  return distinct.every((l) => l === label) ? undefined : distinct;
};

const labels = (list: unknown): string[] =>
  Array.isArray(list) ? list.filter((v): v is string => typeof v === "string" && v !== "") : [];

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
  if (entry["opacity"] !== undefined) {
    const opacity = parseMorphSpan(entry["opacity"]);
    if (opacity === undefined) return undefined;
    out.opacity = opacity;
  }
  return out.fill || out.stroke || out.opacity !== undefined ? out : undefined;
};

export function buildMorphRecipe(name: string, morph: Record<string, unknown>): MorphRecipe {
  const root = policyOf(morph);
  const edges = new Set<string>();
  for (const clip of Array.isArray(morph["clips"]) ? morph["clips"] : []) {
    if (isRecord(clip)) for (const label of labels(clip["between"])) edges.add(label);
  }
  const layers: Record<string, MorphPolicy> = table();
  if (isRecord(morph["layers"])) {
    for (const label of Object.keys(morph["layers"]).sort()) {
      const entry = morph["layers"][label];
      if (!isRecord(entry)) continue;
      const policy = policyOf(entry);
      const partner = partnerOf(label, entry, edges);
      if (partner) policy.partner = partner;
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
      const spread = clip["spread"] === undefined ? MORPH_CLIP_SPREAD_DEFAULT : parseMorphSpread(clip["spread"]);
      if (!between.length || !targets.length || spread === undefined) continue;
      clips.push({ between, targets, ...(spread === MORPH_CLIP_SPREAD_DEFAULT ? {} : { spread }) });
    }
  }
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
    ...(root.depth && root.depth !== MORPH_DEPTH_REST ? { depth: root.depth } : {}),
    layers,
    keyframes,
    clips,
    ...(paints.length ? { paints } : {}),
  };
}

export function recipeGroups(recipe: MorphRecipe): string[] {
  const groups: string[] = [];
  for (const keyframe of recipe.keyframes) {
    for (const group of Object.keys(keyframe.states)) {
      if (!groups.includes(group)) groups.push(group);
    }
  }
  return groups;
}

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

export function serializeMorphRecipe(recipe: MorphRecipe): string {
  return JSON.stringify(recipe);
}

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
    clips: Array.isArray(value["clips"])
      ? value["clips"].map((clip) =>
          isRecord(clip) && typeof clip["spread"] === "number" ? { ...clip, spread: `${clip["spread"]}px` } : clip,
        )
      : value["clips"],
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
  return serializeMorphRecipe(recipe) === text ? recipe : undefined;
}
