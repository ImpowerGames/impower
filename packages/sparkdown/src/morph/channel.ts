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
import { MORPH_BAKE_FORMAT, MORPH_PICK_NONE, type MorphConditions, type MorphProgramChannel, type MorphRecipe, type MorphRef } from "./types";

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

export interface MorphChoice<T> {
  chosen: T[];
  ambiguous: string[][];
}

export function chooseSpeechMorphs<T extends { name: string; groups: readonly string[] }>(
  members: readonly T[],
  speech: MorphProgramChannel["speech"],
  pick: string | undefined,
): MorphChoice<T> {
  const isSpeech = (member: T) => own(speech, member.name) !== undefined;
  const chosen = members.filter((member) => !isSpeech(member));
  const ambiguous: string[][] = [];
  if (pick === MORPH_PICK_NONE) return { chosen, ambiguous };
  const pending = members.filter(isSpeech);
  while (pending.length > 0) {
    const cluster = [pending.shift()!];
    for (let i = 0; i < cluster.length; i += 1) {
      for (let j = pending.length - 1; j >= 0; j -= 1) {
        if (pending[j]!.groups.some((group) => cluster[i]!.groups.includes(group))) cluster.push(...pending.splice(j, 1));
      }
    }
    const defaults = cluster.filter((member) => own(speech, member.name)?.default);
    const one =
      cluster.length === 1
        ? cluster[0]
        : (cluster.find((member) => member.name === pick) ?? (defaults.length === 1 ? defaults[0] : undefined));
    if (one) chosen.push(one);
    else ambiguous.push(cluster.map((member) => member.name).sort());
  }
  return { chosen: ambiguous.length > 0 ? [] : chosen, ambiguous };
}

const choiceMembers = (members: readonly MorphMember[]) => members.map((member) => ({ ...member, name: member.recipe.name }));

function makeRefs(
  members: readonly MorphMember[],
  imageName: string,
  image: any,
  selection: Record<string, string>,
): MorphRef[] {
  if (members.length === 0) return [];
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
    const timing = effective["timing"];
    if (timing && typeof timing === "object" && (timing as Record<string, unknown>)["trigger"] === "speech") {
      (channel.speech ??= table())[name] = effective["default"] === true ? { default: true } : {};
    }
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
    const struct = own(context["image"], image);
    const refsFor = (pick: string | undefined) =>
      makeRefs(chooseSpeechMorphs(choiceMembers(members), channel.speech, pick).chosen, image, struct, selection);
    const refs = refsFor(undefined);
    if (refs.length) channel.variants[variant] = refs;
    const speech = members.map((member) => member.recipe.name).filter((name) => own(channel.speech, name) !== undefined);
    if (speech.length === 0) continue;
    const picks: Record<string, MorphRef[]> = table();
    for (const pick of [MORPH_PICK_NONE, ...speech]) picks[pick] = refsFor(pick);
    (channel.picks ??= table())[variant] = picks;
  }
  return channel;
}

export function channelRefs(channel: MorphProgramChannel | undefined): { variant: string; ref: MorphRef }[] {
  const seen = new Set<string>();
  const refs: { variant: string; ref: MorphRef }[] = [];
  const add = (variant: string, list: readonly MorphRef[]) => {
    for (const ref of list) {
      const id = JSON.stringify([variant, ref.key]);
      if (seen.has(id)) continue;
      seen.add(id);
      refs.push({ variant, ref });
    }
  };
  for (const [variant, list] of Object.entries(channel?.variants ?? {})) add(variant, list);
  for (const [variant, picks] of Object.entries(channel?.picks ?? {})) {
    for (const [pick, list] of Object.entries(picks)) if (pick !== MORPH_PICK_NONE) add(variant, list);
  }
  return refs;
}

export function speechMorphsForStruct(
  context: Context | undefined,
  channel: MorphProgramChannel | undefined,
  struct: any,
): string[] {
  const name = struct?.["$name"];
  if (!context || !channel?.speech || typeof name !== "string") return [];
  const picks = own(channel.picks, name);
  if (picks) return Object.keys(picks).filter((pick) => pick !== MORPH_PICK_NONE);
  if (own(channel.variants, name)) return [];
  return playingMembers(context, channel, struct)
    .members.map((member) => member.recipe.name)
    .filter((morph) => own(channel.speech, morph) !== undefined);
}

export function ambiguousSpeechMorphs(
  context: Context | undefined,
  channel: MorphProgramChannel | undefined,
  struct: any,
): string[][] {
  if (!channel) return [];
  const members = speechMorphsForStruct(context, channel, struct).flatMap((morph) => {
    const entry = recipeEntry(own(channel.recipes, morph) ?? "", own(channel.conditions ?? {}, morph));
    return entry ? [{ name: morph, groups: entry.groups }] : [];
  });
  return chooseSpeechMorphs(members, channel.speech, undefined).ambiguous;
}

export function morphRefsForStruct(
  context: Context | undefined,
  channel: MorphProgramChannel | undefined,
  struct: any,
  pick?: string,
): MorphRef[] {
  const name = struct?.["$name"];
  if (!context || !channel || typeof name !== "string") return [];
  const picks = own(channel.picks, name);
  const picked = pick === undefined ? undefined : own(picks, pick);
  if (picked) return picked;
  const listed = own(channel.variants, name);
  if (listed || picks) return listed ?? [];
  const { image, selection, members } = playingMembers(context, channel, struct);
  if (!image || members.length === 0) return [];
  return makeRefs(chooseSpeechMorphs(choiceMembers(members), channel.speech, pick).chosen, image.$name, image, selection);
}

function playingMembers(
  context: Context,
  channel: MorphProgramChannel,
  struct: any,
): { image?: any; selection: Record<string, string>; members: MorphMember[] } {
  const name = struct["$name"] as string;
  const resolved = resolveImageAttributes(context, struct, { visibility: false });
  const image = resolved.image;
  const vocabulary = resolved.vocabulary;
  if (!image || image.$type !== "image" || !vocabulary || typeof image.$name !== "string") {
    return { selection: resolved.selection, members: [] };
  }
  const members: MorphMember[] = [];
  for (const [morph, text] of Object.entries(channel.recipes)) {
    const entry = recipeEntry(text, own(channel.conditions ?? {}, morph));
    if (!entry) continue;
    const { recipe, requirements, groups } = entry;
    const compatible =
      startsEveryGroup(requirements) &&
      groups.length > 0 &&
      groups.every((group) => [...requirements.groups.get(group)!].every((state) => groupHasState(vocabulary, group, state)));
    if (!compatible) continue;
    if (bindVariant(vocabulary, name, resolved.selection, requirements).status !== "active") continue;
    members.push({ recipe, text, groups });
  }
  return { image, selection: resolved.selection, members };
}

function conditionsOf(morph: Record<string, unknown>): MorphConditions | undefined {
  const conditions: MorphConditions = {};
  for (const field of ["when", "unless"] as const) {
    const parsed = parseMorphConditions(morph[field]);
    if (parsed) conditions[field] = parsed.map(({ group, state }) => `${group}.${state}`);
  }
  return conditions.when || conditions.unless ? conditions : undefined;
}

interface RecipeEntry {
  recipe: MorphRecipe;
  requirements: MorphRequirements;
  groups: string[];
}

const recipeEntries = new Map<string, RecipeEntry | undefined>();

function recipeEntry(text: string, conditions: MorphConditions | undefined): RecipeEntry | undefined {
  const key = conditions ? `${text}\n${JSON.stringify(conditions)}` : text;
  if (recipeEntries.has(key)) return recipeEntries.get(key);
  if (recipeEntries.size >= 256) recipeEntries.clear();
  const recipe = parseMorphRecipe(text);
  const requirements = recipe ? morphRequirements({ ...recipeAsMorph(recipe), ...conditions }) : undefined;
  const entry = recipe && requirements ? { recipe, requirements, groups: [...requirements.groups.keys()] } : undefined;
  recipeEntries.set(key, entry);
  return entry;
}

const parsedRecipe = (text: string): MorphRecipe | undefined => recipeEntry(text, undefined)?.recipe;

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
  pick?: string,
): ShownLook | undefined {
  const refs = morphRefsForStruct(context, channel, struct, pick);
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
  pick?: string,
): (ImageLayer & { shown?: true })[] {
  const layers = resolveImageLayers(context, struct);
  if (!context || !channel) return layers;
  return layers.map((layer) => {
    const look = layer.struct ? shownLook(context, channel, layer.struct, poseOf, pick) : undefined;
    if (!look?.attributes.length) return layer;
    const src = filterImage(context, shownLookStruct(layer.struct, look.attributes)).src;
    return src ? { ...layer, src, shown: true as const } : layer;
  });
}
