import type { AttributeSelection, AttributeVocabulary } from "../attributes";
import {
  bindMorph,
  bindVariant,
  groupHasState,
  morphImages,
  morphRequirements,
  poseSelection,
  type MorphRequirements,
} from "../compiler/morph/bindMorph";
import { parseMorphConditions } from "../compiler/morph/morphSchema";
import { filterImage, resolveImageAttributes } from "../compiler/utils/filterImage";
import { resolveImageLayers, type ImageLayer } from "../compiler/utils/resolveImageLayers";
import { buildFilteredSrc, serializeImageFilterParam } from "../filters/filteredSvg";
import { hashText } from "./hash";
import { own, table } from "./own";
import { buildMorphRecipe, morphOverlaps, morphRestPose, parseMorphRecipe, recipeAsMorph, serializeMorphRecipe } from "./recipe";
import { MORPH_BAKE_FORMAT, type MorphConditions, type MorphProgramChannel, type MorphRecipe, type MorphRef } from "./types";

type Context = { [type: string]: { [name: string]: any } };

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

const startsEveryGroup = (requirements: MorphRequirements): boolean =>
  [...requirements.groups.keys()].every((group) => requirements.start.has(group));

const canonicalSelection =(selection: Record<string, string>): string =>
  serializeImageFilterParam(selection) ??
  JSON.stringify(Object.fromEntries(Object.entries(selection).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))));

interface MorphMember {
  recipe: MorphRecipe;
  text: string;
  groups: string[];
}

function makeRef(
  members: readonly MorphMember[],
  imageName: string,
  image: any,
  selection: Record<string, string>,
): MorphRef | undefined {
  const token = sourceToken(image);
  if (!token) return undefined;
  const canonical = canonicalSelection(selection);
  const texts = members.map((member) => member.text);
  const key = hashText(JSON.stringify([MORPH_BAKE_FORMAT, token, canonical, ...texts]));
  const ref: MorphRef = {
    morphs: members.map((member) => member.recipe.name),
    key,
    image: imageName,
    selection: canonical,
    groups: members.flatMap((member) => member.groups),
  };
  if (!image?.data) {
    const filtered = buildFilteredSrc(image, selection);
    if (filtered?.includes("attributes=")) {
      ref.src = `${filtered}${texts.map((text) => `&morph=${encodeURIComponent(text)}`).join("")}&key=${key}`;
    }
  }
  return ref;
}

function makeRefs(
  members: readonly MorphMember[],
  imageName: string,
  image: any,
  selection: Record<string, string>,
): MorphRef[] {
  const sorted = [...members].sort((a, b) => (a.recipe.name < b.recipe.name ? -1 : a.recipe.name > b.recipe.name ? 1 : 0));
  const sets = morphOverlaps(sorted.map((member) => member.recipe)).length ? sorted.map((member) => [member]) : [sorted];
  return sets.flatMap((set) => makeRef(set, imageName, image, selection) ?? []);
}

export function buildMorphChannel(
  context: Context,
  morphs: ReadonlyMap<string, Record<string, unknown>>,
): MorphProgramChannel | undefined {
  if (morphs.size === 0) return undefined;
  const channel: MorphProgramChannel = { recipes: table(), variants: table() };
  const images = morphImages(context);
  const playing = new Map<string, { image: string; selection: Record<string, string>; members: MorphMember[] }>();
  for (const [name, effective] of morphs) {
    const recipe = buildMorphRecipe(name, effective);
    const text = serializeMorphRecipe(recipe);
    channel.recipes[name] = text;
    const conditions = conditionsOf(effective);
    if (conditions) (channel.conditions ??= table())[name] = conditions;
    const binding = bindMorph(context, effective, images);
    if (!startsEveryGroup(binding.requirements)) continue;
    const member: MorphMember = { recipe, text, groups: [...binding.requirements.groups.keys()] };
    for (const candidate of binding.candidates) {
      if (!candidate.compatible || candidate.type !== "image") continue;
      for (const variant of candidate.variants) {
        if (variant.status !== "active") continue;
        const entry = playing.get(variant.name) ?? { image: candidate.image, selection: variant.selection, members: [] };
        entry.members.push(member);
        playing.set(variant.name, entry);
      }
    }
  }
  for (const [variant, { image, selection, members }] of playing) {
    const refs = makeRefs(members, image, own(context["image"], image), selection);
    if (refs.length) channel.variants[variant] = refs;
  }
  return channel;
}

export function morphRefsForStruct(
  context: Context | undefined,
  channel: MorphProgramChannel | undefined,
  struct: any,
): MorphRef[] {
  const name = struct?.["$name"];
  if (!context || !channel || typeof name !== "string") return [];
  const listed = own(channel.variants, name);
  if (listed) return listed;
  const resolved = resolveImageAttributes(context, struct, { visibility: false });
  const image = resolved.image;
  const vocabulary = resolved.vocabulary;
  if (!image || image.$type !== "image" || !vocabulary || typeof image.$name !== "string") return [];
  const members: MorphMember[] = [];
  for (const [morph, text] of Object.entries(channel.recipes)) {
    const recipe = parseMorphRecipe(text);
    if (!recipe) continue;
    const requirements = morphRequirements({ ...recipeAsMorph(recipe), ...own(channel.conditions ?? {}, morph) });
    const groups = [...requirements.groups.keys()];
    const compatible =
      startsEveryGroup(requirements) &&
      groups.length > 0 &&
      groups.every((group) => [...requirements.groups.get(group)!].every((state) => groupHasState(vocabulary, group, state)));
    if (!compatible) continue;
    if (bindVariant(vocabulary, name, resolved.selection, requirements).status !== "active") continue;
    members.push({ recipe, text, groups });
  }
  return members.length ? makeRefs(members, image.$name, image, resolved.selection) : [];
}

function conditionsOf(morph: Record<string, unknown>): MorphConditions | undefined {
  const conditions: MorphConditions = {};
  for (const field of ["when", "unless"] as const) {
    const parsed = parseMorphConditions(morph[field]);
    if (parsed) conditions[field] = parsed.map(({ group, state }) => `${group}.${state}`);
  }
  return conditions.when || conditions.unless ? conditions : undefined;
}

const parsedRecipes = new Map<string, MorphRecipe | undefined>();
const parsedRecipe = (text: string): MorphRecipe | undefined => {
  if (parsedRecipes.has(text)) return parsedRecipes.get(text);
  if (parsedRecipes.size >= 256) parsedRecipes.clear();
  const recipe = parseMorphRecipe(text);
  parsedRecipes.set(text, recipe);
  return recipe;
};

export interface ShownLook {
  image: any;
  vocabulary: AttributeVocabulary;
  selection: AttributeSelection;
  shown: AttributeSelection;
  attributes: string[];
  morphs: { name: string; pose: Record<string, string> }[];
}

export function shownLook(
  context: Context | undefined,
  channel: MorphProgramChannel | undefined,
  struct: any,
  poseOf: (recipe: MorphRecipe) => Record<string, string> = morphRestPose,
): ShownLook | undefined {
  const refs = morphRefsForStruct(context, channel, struct);
  if (refs.length !== 1 || !context || !channel) return undefined;
  const resolved = resolveImageAttributes(context, struct, { visibility: false });
  if (!resolved.vocabulary) return undefined;
  const morphs: ShownLook["morphs"] = [];
  const pose: Record<string, string> = table();
  for (const name of refs[0]!.morphs) {
    const recipe = parsedRecipe(own(channel.recipes, name) ?? "");
    if (!recipe) continue;
    const posed = poseOf(recipe);
    morphs.push({ name, pose: posed });
    Object.assign(pose, posed);
  }
  const shown = poseSelection(resolved.vocabulary, resolved.selection, pose);
  const attributes = Object.entries(shown)
    .filter(([group, state]) => own(resolved.selection, group) !== state)
    .map(([group, state]) => `${group}.${state}`);
  return { image: resolved.image, vocabulary: resolved.vocabulary, selection: resolved.selection, shown, attributes, morphs };
}

export function shownLookStruct(struct: any, attributes: readonly string[]): any {
  if (!attributes.length || !struct || typeof struct !== "object") return struct;
  return { $type: "filtered_image", $name: struct.$name, image: { $type: struct.$type, $name: struct.$name }, attributes: [...attributes] };
}

export function shownImageLayers(
  context: Context | undefined,
  channel: MorphProgramChannel | undefined,
  struct: any,
  poseOf: (recipe: MorphRecipe) => Record<string, string> = morphRestPose,
): (ImageLayer & { shown?: true })[] {
  const layers = resolveImageLayers(context, struct);
  if (!context || !channel) return layers;
  return layers.map((layer) => {
    const look = layer.struct ? shownLook(context, channel, layer.struct, poseOf) : undefined;
    if (!look?.attributes.length) return layer;
    const src = filterImage(context, shownLookStruct(layer.struct, look.attributes)).src;
    return src ? { ...layer, src, shown: true as const } : layer;
  });
}
