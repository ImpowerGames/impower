import {
  bindMorph,
  bindVariant,
  groupHasState,
  morphImages,
  morphRequirements,
  type MorphRequirements,
} from "../compiler/morph/bindMorph";
import { resolveImageAttributes } from "../compiler/utils/filterImage";
import { buildFilteredSrc, serializeImageFilterParam } from "../filters/filteredSvg";
import { hashText } from "./hash";
import { own, table } from "./own";
import { buildMorphRecipe, morphOverlaps, parseMorphRecipe, recipeAsMorph, serializeMorphRecipe } from "./recipe";
import { MORPH_BAKE_FORMAT, type MorphProgramChannel, type MorphRecipe, type MorphRef } from "./types";

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
  [...requirements.groups.keys()].every((group) => requirements.rest.has(group));

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
  for (const text of Object.values(channel.recipes)) {
    const recipe = parseMorphRecipe(text);
    if (!recipe) continue;
    const requirements = morphRequirements(recipeAsMorph(recipe));
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
