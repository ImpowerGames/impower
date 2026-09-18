import {
  ATTRIBUTE_ROOT,
  evaluateAttributeVisibility,
  matchesAttributeOption,
  type AttributeFolder,
  type AttributeSelection,
  type AttributeVocabulary,
} from "../../attributes";
import { resolveImageAttributes } from "../utils/filterImage";
import { normalizeMorphKeyframes } from "./normalizeMorphKeyframes";

type ImageContext = { [type: string]: { [name: string]: any } };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === "object" && !Array.isArray(value);

/** What a morph's keyframes ask of the artwork. */
export interface MorphRequirements {
  /** Groups some keyframe sets a `state` for, with every state it names. */
  groups: Map<string, Set<string>>;
  /**
   * The state each group starts from: the one the first keyframe gives it, if
   * the first keyframe gives it one. A variant resting in another state is
   * left alone. A first keyframe that leaves the group out starts from the
   * variant's own resting state, as a CSS keyframe that omits a property
   * starts from the element's underlying value, so it constrains nothing.
   */
  rest: Map<string, string>;
  /** Layer labels the morph names: `layers:` keys, clip labels, posed layers. */
  labels: Set<string>;
}

export function morphRequirements(morph: Record<string, unknown>): MorphRequirements {
  const groups = new Map<string, Set<string>>();
  const rest = new Map<string, string>();
  const labels = new Set<string>();
  const keyframes = Array.isArray(morph["keyframes"])
    ? normalizeMorphKeyframes(morph["keyframes"])
        .map((frame, index) => ({ frame, index }))
        .sort((a, b) => a.frame["offset"] as number - (b.frame["offset"] as number) || a.index - b.index)
        .map(({ frame }) => frame)
    : [];
  keyframes.forEach((keyframe, index) => {
    for (const [key, container] of Object.entries(keyframe)) {
      if (key === "offset" || !isRecord(container)) continue;
      const state = container["state"];
      if (typeof state === "string" && state && !state.includes(".")) {
        if (!groups.has(key)) groups.set(key, new Set());
        groups.get(key)!.add(state);
        if (index === 0) rest.set(key, state);
      }
      if (Object.keys(container).some((k) => k !== "state")) labels.add(key);
    }
  });
  if (isRecord(morph["layers"])) {
    for (const label of Object.keys(morph["layers"])) labels.add(label);
  }
  if (Array.isArray(morph["clips"])) {
    for (const clip of morph["clips"]) {
      if (!isRecord(clip)) continue;
      for (const field of ["between", "targets"]) {
        const list = clip[field];
        if (Array.isArray(list)) {
          for (const label of list) if (typeof label === "string") labels.add(label);
        }
      }
    }
  }
  return { groups, rest, labels };
}

/** One way a variant can be unusable for a morph. */
export interface MorphVariantProblem {
  group: string;
  message: string;
}

export interface MorphVariantBinding {
  /** The variant's context key: an image name or a `filtered_image` name. */
  name: string;
  /** The attribute selection the variant was written with. */
  selection: AttributeSelection;
  /**
   * `active`: the morph plays on this variant. `dormant`: the variant rests in
   * a different state than the morph starts from (explicitly closed eyes stay
   * closed). `skipped`: the variant cannot rest where the morph needs it to.
   */
  status: "active" | "dormant" | "skipped";
  /**
   * The concrete resting state of each driven group in each visible folder
   * that has layers for it, keyed by folder. An authored `open-wide` stays
   * `open-wide` here even when the morph starts at `open`.
   */
  rest: Record<string, Record<string, string>>;
  problems: MorphVariantProblem[];
}

export interface MorphCandidate {
  /** The image's context key. */
  image: string;
  type: "image" | "layered_image";
  uri?: string;
  vocabulary: AttributeVocabulary;
  /** Driven groups this image has no layers for. */
  missingGroups: string[];
  /** Driven states this image's group has no option for. */
  missingStates: { group: string; state: string }[];
  /** True when the image has every driven group and state. */
  compatible: boolean;
  variants: MorphVariantBinding[];
}

export interface MorphBinding {
  requirements: MorphRequirements;
  /**
   * Images that have at least one driven group, before full compatibility is
   * tested. When the morph drives no group yet, every image with groups.
   */
  candidates: MorphCandidate[];
}

/** Whether an image's group can show `state`: an option it names, or a
 *  hyphenated refinement of one (`open-wide` satisfies an `open` layer). */
export function groupHasState(
  vocabulary: AttributeVocabulary,
  group: string,
  state: string,
): boolean {
  return (vocabulary.groups[group]?.options ?? []).some((option) =>
    matchesAttributeOption(state, option),
  );
}

/** Images in the context with an attribute vocabulary, by context key. */
export function morphImages(context: ImageContext): {
  name: string;
  type: "image" | "layered_image";
  struct: any;
  vocabulary: AttributeVocabulary;
}[] {
  const images: ReturnType<typeof morphImages> = [];
  for (const type of ["image", "layered_image"] as const) {
    for (const [name, struct] of Object.entries(context[type] ?? {})) {
      if (name.startsWith("$") || !struct || typeof struct !== "object") continue;
      const vocabulary = resolveImageAttributes(context, struct).vocabulary;
      if (!vocabulary || Object.keys(vocabulary.groups).length === 0) continue;
      images.push({ name, type, struct, vocabulary });
    }
  }
  return images;
}

// The resting choices a folder makes for a group: the selection when there is
// one, otherwise the nearest folder default, otherwise `off` for a switch.
function restChoices(
  vocabulary: AttributeVocabulary,
  selection: AttributeSelection,
  group: string,
  folder: string,
): string[] {
  if (Object.hasOwn(selection, group)) return [selection[group]!];
  const seen = new Set<string>();
  let key: string | undefined = folder;
  while (key && !seen.has(key)) {
    seen.add(key);
    const scope: AttributeFolder | undefined = vocabulary.folders[key];
    if (scope && Object.hasOwn(scope.defaults, group) && scope.defaults[group]?.length) {
      return scope.defaults[group]!;
    }
    key = scope?.parent;
  }
  return vocabulary.groups[group]?.switch ? ["off"] : [];
}

function bindVariant(
  vocabulary: AttributeVocabulary,
  name: string,
  selection: AttributeSelection,
  requirements: MorphRequirements,
): MorphVariantBinding {
  const { visible } = evaluateAttributeVisibility(vocabulary, selection);
  const rest: Record<string, Record<string, string>> = {};
  const problems: MorphVariantProblem[] = [];
  let dormant = false;
  for (const group of requirements.groups.keys()) {
    const start = requirements.rest.get(group);
    const byFolder: Record<string, string> = {};
    let matching = 0;
    let differing = 0;
    for (const [key, folder] of Object.entries(vocabulary.folders)) {
      if (key !== ATTRIBUTE_ROOT && !visible[key]) continue;
      if (!folder.options[group]?.length) continue;
      const choices = restChoices(vocabulary, selection, group, key);
      if (choices.length === 0) {
        problems.push({
          group,
          message: `folder "${folder.name}" has no resting \`${group}\` state; mark one \`${group}\` layer \`:default\``,
        });
        continue;
      }
      if (choices.length > 1) {
        problems.push({
          group,
          message: `folder "${folder.name}" rests in more than one \`${group}\` state (${choices.join(", ")}); mark only one \`:default\``,
        });
        continue;
      }
      const choice = choices[0]!;
      byFolder[folder.name] = choice;
      if (start === undefined || matchesAttributeOption(choice, start)) {
        matching += 1;
      } else {
        differing += 1;
      }
    }
    if (matching > 0 && differing > 0) {
      problems.push({
        group,
        message: `its folders rest in different \`${group}\` states (${Object.entries(byFolder)
          .map(([folder, state]) => `"${folder}": ${state}`)
          .join(", ")}), and only some start where the morph starts (\`${start}\`)`,
      });
    } else if (differing > 0) {
      dormant = true;
    }
    rest[group] = byFolder;
  }
  return {
    name,
    selection,
    status: problems.length > 0 ? "skipped" : dormant ? "dormant" : "active",
    rest,
    problems,
  };
}

/**
 * Find the images a morph applies to. Candidates are the images with at least
 * one of the groups its keyframes drive; a candidate is compatible only when it
 * has every driven group and every state named for it. Each compatible
 * candidate's variants (the image itself and every `filtered_image` selection
 * of it) are bound by their effective resting state, folder by folder.
 *
 * Binding evaluates selections only to classify variants; it never publishes
 * the attribute diagnostics a hypothetical selection would raise.
 */
export function bindMorph(
  context: ImageContext,
  morph: Record<string, unknown>,
  images = morphImages(context),
): MorphBinding {
  const requirements = morphRequirements(morph);
  const driven = [...requirements.groups.keys()];
  const candidates: MorphCandidate[] = [];
  for (const image of images) {
    const present = driven.filter((group) => image.vocabulary.groups[group]);
    if (driven.length > 0 && present.length === 0) continue;
    const missingGroups = driven.filter((group) => !image.vocabulary.groups[group]);
    const missingStates: { group: string; state: string }[] = [];
    for (const group of present) {
      for (const state of requirements.groups.get(group)!) {
        if (!groupHasState(image.vocabulary, group, state)) {
          missingStates.push({ group, state });
        }
      }
    }
    const compatible =
      driven.length > 0 && missingGroups.length === 0 && missingStates.length === 0;
    const variants: MorphVariantBinding[] = [];
    if (compatible) {
      variants.push(bindVariant(image.vocabulary, image.name, {}, requirements));
      for (const [name, filtered] of Object.entries(context["filtered_image"] ?? {})) {
        if (name.startsWith("$") || name === image.name) continue;
        const resolved = resolveImageAttributes(context, filtered);
        if (resolved.image !== image.struct) continue;
        variants.push(
          bindVariant(image.vocabulary, name, resolved.selection, requirements),
        );
      }
    }
    candidates.push({
      image: image.name,
      type: image.type,
      uri: image.struct?.uri,
      vocabulary: image.vocabulary,
      missingGroups,
      missingStates,
      compatible,
      variants,
    });
  }
  return { requirements, candidates };
}

/** Every layer label in an image's artwork. */
export function morphImageLabels(vocabulary: AttributeVocabulary): Set<string> {
  const labels = new Set<string>();
  for (const layer of vocabulary.layers) {
    if (layer.parsed.label) labels.add(layer.parsed.label);
  }
  return labels;
}
