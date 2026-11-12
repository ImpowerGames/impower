import {
  ATTRIBUTE_ROOT,
  evaluateAttributeVisibility,
  type AttributeFolder,
  type AttributeSelection,
  type AttributeVocabulary,
} from "../../attributes";
import { resolveImageAttributes } from "../utils/filterImage";
import { parseMorphConditions } from "./morphSchema";
import { normalizeMorphKeyframes } from "./normalizeMorphKeyframes";

type ImageContext = { [type: string]: { [name: string]: any } };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === "object" && !Array.isArray(value);

export interface MorphCondition {
  group: string;
  state: string;
}

export interface MorphRequirements {
  groups: Map<string, Set<string>>;
  start: Map<string, string>;
  rest: Map<string, string>;
  labels: Set<string>;
  when: MorphCondition[];
  unless: MorphCondition[];
}

const plainState = (container: unknown): string | undefined => {
  const state = isRecord(container) ? container["state"] : undefined;
  return typeof state === "string" && state && !state.includes(".") ? state : undefined;
};

export function morphRequirements(morph: Record<string, unknown>): MorphRequirements {
  const groups = new Map<string, Set<string>>();
  const start = new Map<string, string>();
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
      const state = plainState(container);
      if (state) {
        if (!groups.has(key)) groups.set(key, new Set());
        groups.get(key)!.add(state);
        if (index === 0) start.set(key, state);
        rest.set(key, state);
      }
      if (Object.keys(container).some((k) => k !== "state")) labels.add(key);
    }
  });
  if (isRecord(morph["rest"])) {
    for (const [group, container] of Object.entries(morph["rest"])) {
      const state = plainState(container);
      if (!state || !groups.has(group)) continue;
      groups.get(group)!.add(state);
      rest.set(group, state);
    }
  }
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
  return {
    groups,
    start,
    rest,
    labels,
    when: parseMorphConditions(morph["when"]) ?? [],
    unless: parseMorphConditions(morph["unless"]) ?? [],
  };
}

export interface MorphVariantProblem {
  group: string;
  message: string;
}

export interface MorphVariantBinding {
  name: string;
  selection: AttributeSelection;
  status: "active" | "excluded" | "skipped";
  rest: Record<string, string>;
  problems: MorphVariantProblem[];
}

export interface MorphCandidate {
  image: string;
  type: "image" | "layered_image";
  uri?: string;
  vocabulary: AttributeVocabulary;
  missingGroups: string[];
  missingStates: { group: string; state: string }[];
  compatible: boolean;
  excluded: boolean;
  variants: MorphVariantBinding[];
}

export interface MorphBinding {
  requirements: MorphRequirements;
  candidates: MorphCandidate[];
}

export function groupHasState(
  vocabulary: AttributeVocabulary,
  group: string,
  state: string,
): boolean {
  return (vocabulary.groups[group]?.options ?? []).includes(state);
}

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

function folderChoices(
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

const groupFolders = new WeakMap<AttributeVocabulary, Map<string, [string, AttributeFolder][]>>();

function drawingFolders(
  vocabulary: AttributeVocabulary,
  visible: Record<string, boolean>,
  group: string,
): [string, AttributeFolder][] {
  let byGroup = groupFolders.get(vocabulary);
  if (!byGroup) {
    byGroup = new Map();
    for (const entry of Object.entries(vocabulary.folders)) {
      for (const [drawn, options] of Object.entries(entry[1].options)) {
        if (!options.length) continue;
        const list = byGroup.get(drawn) ?? [];
        list.push(entry);
        byGroup.set(drawn, list);
      }
    }
    groupFolders.set(vocabulary, byGroup);
  }
  return (byGroup.get(group) ?? []).filter(([key]) => key === ATTRIBUTE_ROOT || visible[key]);
}

export function lookChoices(
  vocabulary: AttributeVocabulary,
  selection: AttributeSelection,
  group: string,
  visible: Record<string, boolean> = visibleIn(vocabulary, selection),
): string[] {
  const choices = new Set<string>();
  for (const [key] of drawingFolders(vocabulary, visible, group)) {
    for (const choice of folderChoices(vocabulary, selection, group, key)) choices.add(choice);
  }
  return [...choices];
}

export function stateIsActive(
  vocabulary: AttributeVocabulary,
  selection: AttributeSelection,
  condition: MorphCondition,
  visible?: Record<string, boolean>,
): boolean {
  return lookChoices(vocabulary, selection, condition.group, visible).includes(condition.state);
}

const VISIBILITY_MEMO_LIMIT = 256;
const visibilityMemo = new WeakMap<AttributeVocabulary, Map<string, Record<string, boolean>>>();

function visibleIn(vocabulary: AttributeVocabulary, selection: AttributeSelection): Record<string, boolean> {
  const key = JSON.stringify(Object.entries(selection).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  let memo = visibilityMemo.get(vocabulary);
  if (!memo) visibilityMemo.set(vocabulary, (memo = new Map()));
  let visible = memo.get(key);
  if (!visible) {
    if (memo.size >= VISIBILITY_MEMO_LIMIT) memo.clear();
    visible = evaluateAttributeVisibility(vocabulary, selection).visible;
    memo.set(key, visible);
  }
  return visible;
}

export function poseSelection(
  vocabulary: AttributeVocabulary,
  selection: AttributeSelection,
  pose: Readonly<Record<string, string>>,
): AttributeSelection {
  const visible = visibleIn(vocabulary, selection);
  const posed: AttributeSelection = { ...selection };
  for (const [group, state] of Object.entries(pose)) {
    const choices = lookChoices(vocabulary, selection, group, visible);
    if (choices.length > 0 && choices.every((choice) => choice === state)) continue;
    posed[group] = state;
  }
  return posed;
}

export function conditionsExclude(
  vocabulary: AttributeVocabulary,
  selection: AttributeSelection,
  requirements: Pick<MorphRequirements, "when" | "unless">,
): boolean {
  const visible = visibleIn(vocabulary, selection);
  const active = (condition: MorphCondition) => stateIsActive(vocabulary, selection, condition, visible);
  return requirements.unless.some(active) || !requirements.when.every(active);
}

export function bindVariant(
  vocabulary: AttributeVocabulary,
  name: string,
  selection: AttributeSelection,
  requirements: MorphRequirements,
): MorphVariantBinding {
  const visible = visibleIn(vocabulary, selection);
  const rest = Object.fromEntries(requirements.rest);
  if (conditionsExclude(vocabulary, selection, requirements)) {
    return { name, selection, status: "excluded", rest, problems: [] };
  }
  const problems: MorphVariantProblem[] = [];
  for (const [group, states] of requirements.groups) {
    for (const [, folder] of drawingFolders(vocabulary, visible, group)) {
      const options = folder.options[group]!;
      const missing = [...states].filter((state) => !options.includes(state));
      if (missing.length > 0) {
        problems.push({
          group,
          message: `folder "${folder.name}" draws no ${missing.map((state) => `\`${group}.${state}\``).join(" or ")}`,
        });
      }
    }
  }
  return { name, selection, status: problems.length > 0 ? "skipped" : "active", rest, problems };
}

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
    const looks: { name: string; selection: AttributeSelection }[] = [{ name: image.name, selection: {} }];
    for (const [name, filtered] of Object.entries(context["filtered_image"] ?? {})) {
      if (name.startsWith("$") || name === image.name) continue;
      const resolved = resolveImageAttributes(context, filtered);
      if (resolved.image !== image.struct) continue;
      looks.push({ name, selection: resolved.selection });
    }
    const variants: MorphVariantBinding[] = compatible
      ? looks.map((look) => bindVariant(image.vocabulary, look.name, look.selection, requirements))
      : [];
    const excluded = looks.every((look) => conditionsExclude(image.vocabulary, look.selection, requirements));
    candidates.push({
      image: image.name,
      type: image.type,
      uri: image.struct?.uri,
      vocabulary: image.vocabulary,
      missingGroups,
      missingStates,
      compatible,
      excluded,
      variants,
    });
  }
  return { requirements, candidates };
}

export function morphImageLabels(vocabulary: AttributeVocabulary): Set<string> {
  const labels = new Set<string>();
  for (const layer of vocabulary.layers) {
    if (layer.parsed.label) labels.add(layer.parsed.label);
  }
  return labels;
}
