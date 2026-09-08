/** Production semantic bridge for the Python legacy migration oracle. */
import { readFileSync } from "node:fs";
import { buildAttributeVocabulary, buildSVGAttributeVocabulary, resolveAttributes, evaluateAttributeVisibility } from "../../packages/sparkdown/src/attributes/index";
interface Layer { key: string; name: string; parent?: string; legacyId?: string; }
const input = JSON.parse(readFileSync(0, "utf8")) as {
  trees: Record<string, Layer[]>;
  svgs?: Record<string, string>;
  requests: { tree: string; attributes: string[] }[];
};
const vocabularies = Object.fromEntries(Object.entries(input.trees).map(([name, layers]) =>
  [name, input.svgs?.[name] ? buildSVGAttributeVocabulary(input.svgs[name]) : buildAttributeVocabulary(layers)]));
const results = input.requests.map(({ tree, attributes }) => {
  const vocabulary = vocabularies[tree];
  if (!vocabulary) throw new Error(`Missing vocabulary: ${tree}`);
  const resolution = resolveAttributes(vocabulary, attributes);
  const evaluation = evaluateAttributeVisibility(vocabulary, resolution.selection);
  const legacyIds = new Set(input.trees[tree]!.map((layer) => layer.legacyId).filter(Boolean));
  return {
    visible: input.svgs?.[tree]
      ? vocabulary.layers.filter((layer) => layer.id && legacyIds.has(layer.id) && evaluation.visible[layer.key]).map((layer) => layer.id).sort()
      : input.trees[tree]!.filter((layer) => layer.legacyId && evaluation.visible[layer.key]).map((layer) => layer.legacyId).sort(),
    diagnostics: [...resolution.diagnostics, ...evaluation.diagnostics],
  };
});
process.stdout.write(JSON.stringify({ results, diagnostics: Object.fromEntries(Object.entries(vocabularies).map(([key, value]) => [key, value.diagnostics])) }));
