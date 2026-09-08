import { parseLayerName } from "./parseLayerName";
import type {
  AttributeDiagnostic,
  AttributeFolder,
  AttributeLayerInput,
  AttributeVocabulary,
} from "./types";

export const ATTRIBUTE_VOCABULARY_VERSION = 1;
export const ATTRIBUTE_ROOT = "$root";

const folder = (name: string, parent?: string): AttributeFolder => ({
  name,
  ...(parent === undefined ? {} : { parent }),
  defaults: Object.create(null),
  options: Object.create(null),
});

const append = (
  record: Record<string, string[]>,
  group: string,
  options: readonly string[],
) => {
  const values = record[group] ?? (record[group] = []);
  for (const option of options)
    if (!values.includes(option)) values.push(option);
};

export const buildAttributeVocabulary = (
  inputs: readonly AttributeLayerInput[],
): AttributeVocabulary => {
  const vocabulary: AttributeVocabulary = {
    version: ATTRIBUTE_VOCABULARY_VERSION,
    layers: [],
    folders: Object.create(null),
    groups: Object.create(null),
    diagnostics: [],
  };
  vocabulary.folders[ATTRIBUTE_ROOT] = folder("root");
  const keys = new Set(inputs.map((input) => input.key));
  for (const input of inputs) {
    const parent =
      input.parent && keys.has(input.parent) ? input.parent : ATTRIBUTE_ROOT;
    const parsed = input.name
      ? parseLayerName(input.name)
      : { label: "", conditions: [], default: false, diagnostics: [] };
    vocabulary.layers.push({ ...input, parent, parsed });
    vocabulary.folders[input.key] = folder(input.name || input.key, parent);
    vocabulary.diagnostics.push(...parsed.diagnostics);
  }
  for (const layer of vocabulary.layers) {
    const scope = vocabulary.folders[layer.parent]!;
    for (const condition of layer.parsed.conditions) {
      const group =
        vocabulary.groups[condition.group] ??
        (vocabulary.groups[condition.group] = { options: [], switch: false });
      for (const option of condition.options)
        if (!group.options.includes(option)) group.options.push(option);
      append(scope.options, condition.group, condition.options);
      // An OR list shares artwork among alternatives; its first option is the
      // resting choice. Other options must not activate their own artwork.
      if (layer.parsed.default && condition.options[0])
        append(scope.defaults, condition.group, [condition.options[0]]);
    }
  }
  for (const group of Object.values(vocabulary.groups)) {
    group.switch =
      group.options.length > 0 &&
      group.options.every((option) => option === "on" || option === "off");
    if (group.switch) {
      for (const option of ["on", "off"])
        if (!group.options.includes(option)) group.options.push(option);
    }
  }
  for (const scope of Object.values(vocabulary.folders)) {
    for (const [group, options] of Object.entries(scope.defaults)) {
      if (options.length > 1)
        vocabulary.diagnostics.push({
          code: "conflicting-defaults",
          severity: "warning",
          group,
          folder: scope.name,
          message: `Folder "${scope.name}" marks multiple defaults for ${group}: ${options.join(", ")}. Choose one resting option.`,
        });
    }
  }
  return vocabulary;
};

/** Run after collecting all of a character's files, so a per-file rarity is
 * not mistaken for an option occurring only once across the character. */
export const diagnoseRareAttributeOptions = (
  vocabularies: readonly AttributeVocabulary[],
): AttributeDiagnostic[] => {
  const occurrences = new Map<
    string,
    { count: number; group: string; option: string; layer: string }
  >();
  for (const vocabulary of vocabularies) {
    for (const layer of vocabulary.layers) {
      const seen = new Set<string>();
      for (const condition of layer.parsed.conditions) {
        for (const option of condition.options) {
          const key = `${condition.group}.${option}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const item = occurrences.get(key) ?? {
            count: 0,
            group: condition.group,
            option,
            layer: layer.name,
          };
          item.count++;
          occurrences.set(key, item);
        }
      }
    }
  }
  return [...occurrences.values()]
    .filter((item) => item.count === 1)
    .map((item) => ({
      code: "rare-attribute-option",
      severity: "warning",
      group: item.group,
      layer: item.layer,
      message: `Option "${item.group}.${item.option}" appears in only one layer across these portrait files; check its spelling.`,
    }));
};

/** A signature suitable for a persistent workspace cache; bump the schema
 * version whenever parsing or vocabulary semantics change. */
export const attributeVocabularyCacheKey = (
  path: string,
  lastModified: number,
  size: number,
): string =>
  JSON.stringify([ATTRIBUTE_VOCABULARY_VERSION, path, lastModified, size]);
