// What compilation emits for morphs: each declaration's recipe once, and a
// compact reference for every image variant a morph plays on. Nothing here
// reads geometry, so it works the same whether or not the program carries
// SVG source; the bake that needs the source happens later, on the host.

import {
  bindMorph,
  bindVariant,
  groupHasState,
  morphImages,
  morphRequirements,
} from "../compiler/morph/bindMorph";
import { resolveImageAttributes } from "../compiler/utils/filterImage";
import { buildFilteredSrc, serializeImageFilterParam } from "../filters/filteredSvg";
import { hashText } from "./hash";
import { buildMorphRecipe, parseMorphRecipe, recipeAsMorph, serializeMorphRecipe } from "./recipe";
import { MORPH_BAKE_FORMAT, type MorphProgramChannel, type MorphRef } from "./types";

type Context = { [type: string]: { [name: string]: any } };

// Hashing inline artwork is the one cost here that grows with art size, so
// each root image's hash is kept until its data changes.
const dataHashes = new WeakMap<object, { data: string; hash: string }>();
const sourceToken = (image: any): string | undefined => {
  const data = image?.data;
  if (typeof data === "string" && data) {
    const memo = dataHashes.get(image);
    if (memo && memo.data === data) return `data:${memo.hash}`;
    const hash = hashText(data);
    dataHashes.set(image, { data, hash });
    return `data:${hash}`;
  }
  const src = image?.src;
  return typeof src === "string" && src ? `src:${src}` : undefined;
};

const canonicalSelection = (selection: Record<string, string>): string =>
  serializeImageFilterParam(selection) ??
  JSON.stringify(Object.fromEntries(Object.entries(selection).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))));

/** The reference for one active variant, or undefined when the art has no source. */
function makeRef(
  morph: string,
  recipeText: string,
  imageName: string,
  image: any,
  selection: Record<string, string>,
  groups: string[],
): MorphRef | undefined {
  const token = sourceToken(image);
  if (!token) return undefined;
  const canonical = canonicalSelection(selection);
  const key = hashText(JSON.stringify([MORPH_BAKE_FORMAT, token, canonical, recipeText]));
  const ref: MorphRef = { morph, key, image: imageName, selection: canonical, groups };
  // Without inline source the asset service bakes, at the same URL it
  // filters this variant at, with the recipe and identity added.
  if (!image?.data) {
    const filtered = buildFilteredSrc(image, selection);
    if (filtered?.includes("attributes=")) {
      ref.src = `${filtered}&morph=${encodeURIComponent(recipeText)}&key=${key}`;
    }
  }
  return ref;
}

/**
 * The morph channel for a program: `morphs` maps each declaration's name to
 * its effective struct (builtin defaults, ancestors, own body).
 */
export function buildMorphChannel(
  context: Context,
  morphs: ReadonlyMap<string, Record<string, unknown>>,
): MorphProgramChannel | undefined {
  if (morphs.size === 0) return undefined;
  const channel: MorphProgramChannel = { recipes: {}, variants: {} };
  const images = morphImages(context);
  for (const [name, effective] of morphs) {
    const recipeText = serializeMorphRecipe(buildMorphRecipe(name, effective));
    channel.recipes[name] = recipeText;
    const binding = bindMorph(context, effective, images);
    const groups = [...binding.requirements.groups.keys()];
    for (const candidate of binding.candidates) {
      // Only drawn SVG art has geometry to bake.
      if (!candidate.compatible || candidate.type !== "image") continue;
      const image = context["image"]?.[candidate.image];
      for (const variant of candidate.variants) {
        if (variant.status !== "active") continue;
        const ref = makeRef(name, recipeText, candidate.image, image, variant.selection, groups);
        if (ref) (channel.variants[variant.name] ??= []).push(ref);
      }
    }
  }
  return channel;
}

/**
 * The references for any image struct: those compiled for it, or, for a
 * variant no script names yet (a completion candidate), the ones the same
 * binding rules give it.
 */
export function morphRefsForStruct(
  context: Context | undefined,
  channel: MorphProgramChannel | undefined,
  struct: any,
): MorphRef[] {
  const name = struct?.["$name"];
  if (!context || !channel || typeof name !== "string") return [];
  const listed = channel.variants[name];
  if (listed) return listed;
  const resolved = resolveImageAttributes(context, struct, { visibility: false });
  const image = resolved.image;
  const vocabulary = resolved.vocabulary;
  if (!image || image.$type !== "image" || !vocabulary || typeof image.$name !== "string") return [];
  const refs: MorphRef[] = [];
  for (const [morph, recipeText] of Object.entries(channel.recipes)) {
    const recipe = parseMorphRecipe(recipeText);
    if (!recipe) continue;
    const requirements = morphRequirements(recipeAsMorph(recipe));
    const groups = [...requirements.groups.keys()];
    const compatible =
      groups.length > 0 &&
      groups.every((group) => [...requirements.groups.get(group)!].every((state) => groupHasState(vocabulary, group, state)));
    if (!compatible) continue;
    if (bindVariant(vocabulary, name, resolved.selection, requirements).status !== "active") continue;
    const ref = makeRef(morph, recipeText, image.$name, image, resolved.selection, groups);
    if (ref) refs.push(ref);
  }
  return refs;
}
