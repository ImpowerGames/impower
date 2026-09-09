import { parseLayerName } from "./parseLayerName";
import type {
  AttributeDiagnostic,
  AttributeFolder,
  AttributeLayerInput,
  AttributeVocabulary,
} from "./types";

export const ATTRIBUTE_VOCABULARY_VERSION = 3;
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
    vocabulary.diagnostics.push(...parsed.diagnostics.map((diagnostic) => ({ ...diagnostic, path: input.key })));
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
  for (const [path, scope] of Object.entries(vocabulary.folders)) {
    for (const [group, options] of Object.entries(scope.defaults)) {
      if (options.length > 1)
        vocabulary.diagnostics.push({
          code: "conflicting-defaults",
          path,
          severity: "warning",
          group,
          folder: scope.name,
          message: `Folder "${scope.name}" marks multiple defaults for ${group}: ${options.join(", ")}. Choose one resting option.`,
        });
    }
  }
  // A single explicit selection must satisfy every ancestor condition. Keep
  // this diagnostic separate from visibility: nearest-folder defaults remain
  // valid even when they choose different options at different depths.
  const layers = new Map(vocabulary.layers.map((layer) => [layer.key, layer]));
  const overlaps = (a: string, b: string) =>
    a === b || a.startsWith(`${b}-`) || b.startsWith(`${a}-`);
  for (const layer of vocabulary.layers) {
    const inherited = new Map<string, string[]>();
    const visited = new Set<string>([layer.key]);
    let parent = layers.get(layer.parent);
    while (parent && !visited.has(parent.key)) {
      visited.add(parent.key);
      for (const condition of parent.parsed.conditions) {
        const previous = inherited.get(condition.group);
        inherited.set(condition.group, previous === undefined ? condition.options :
          previous.flatMap((a) => condition.options.filter((b) => overlaps(a, b)).map((b) => a.length >= b.length ? a : b)));
      }
      parent = layers.get(parent.parent);
    }
    for (const condition of layer.parsed.conditions) {
      const previous = inherited.get(condition.group);
      if (previous !== undefined && !previous.some((a) => condition.options.some((b) => overlaps(a, b))))
        vocabulary.diagnostics.push({
          code: "contradictory-inherited-condition",
          path: layer.key,
          severity: "warning",
          layer: layer.name,
          group: condition.group,
          message: `Layer "${layer.name}" conflicts with its ancestor conditions for ${condition.group}; no single explicit ${condition.group} selection can show both. Check the nested layer names.`,
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
  const occurrences = new Map<string, { count: number; group: string; option: string; layer: string; path: string }>();
  for (const vocabulary of vocabularies) {
    for (const layer of vocabulary.layers) {
      const seen = new Set<string>();
      for (const condition of layer.parsed.conditions) {
        for (const option of condition.options) {
          const key = condition.group + "." + option;
          if (seen.has(key)) continue;
          seen.add(key);
          const item = occurrences.get(key) ?? { count: 0, group: condition.group, option, layer: layer.name, path: layer.key };
          item.count++;
          occurrences.set(key, item);
        }
      }
    }
  }
  // A rare artistic choice is valid. Warn only when a more common spelling
  // supports a likely typo (one edit or one adjacent transposition).
  const close = (a: string, b: string): boolean => {
    if (a === b || Math.min(a.length, b.length) < 3 || Math.abs(a.length - b.length) > 1) return false;
    if (a.length === b.length) {
      const differing = [...a].flatMap((char, index) => char === b[index] ? [] : [index]);
      if (differing.length === 1) return true;
      const [i, j] = differing;
      return differing.length === 2 && j === i! + 1 && a[i!] === b[j!] && a[j!] === b[i!];
    }
    const [short, long] = a.length < b.length ? [a, b] : [b, a];
    let index = 0;
    while (index < short.length && short[index] === long[index]) index++;
    return short.slice(index) === long.slice(index + 1);
  };
  const diagnostics: AttributeDiagnostic[] = [];
  for (const item of occurrences.values()) {
    if (item.count !== 1) continue;
    const neighbor = [...occurrences.values()].find((candidate) => candidate.count >= 2 && (
      (candidate.group === item.group && close(candidate.option, item.option)) ||
      (candidate.option === item.option && close(candidate.group, item.group))
    ));
    if (!neighbor) continue;
    diagnostics.push({
      code: "rare-attribute-option", severity: "warning", group: item.group,
      layer: item.layer, path: item.path,
      message: 'Option "' + item.group + '.' + item.option + '" appears once and resembles "' + neighbor.group + '.' + neighbor.option + '" used in ' + neighbor.count + ' layers; check its spelling.',
    });
  }
  return diagnostics;
};

/** A signature suitable for a persistent workspace cache; bump the schema
 * version whenever parsing or vocabulary semantics change. */
export const attributeVocabularyCacheKey = (
  path: string,
  lastModified: number,
  size: number,
): string =>
  JSON.stringify([ATTRIBUTE_VOCABULARY_VERSION, path, lastModified, size]);
