/** Production semantic bridge for the Python legacy migration oracle. */
import { readFileSync } from "node:fs";
import { buildAttributeVocabulary, buildSVGAttributeVocabulary, resolveAttributes, evaluateAttributeVisibility } from "../../packages/sparkdown/src/attributes/index";
import { parse, type Node } from "../../packages/sparkdown/src/txml/txml";
interface Layer { key: string; name: string; parent?: string; legacyId?: string; }
const input = JSON.parse(readFileSync(0, "utf8")) as {
  trees: Record<string, Layer[]>;
  svgs?: Record<string, string>;
  requests: { tree: string; attributes: string[] }[];
};
const vocabularies = Object.fromEntries(Object.entries(input.trees).map(([name, layers]) =>
  [name, input.svgs?.[name] ? buildSVGAttributeVocabulary(input.svgs[name]) : buildAttributeVocabulary(layers)]));
/** Map element-only source paths to production parser paths. Source IDs remain
 * audit identities in memory; the migrated SVG carries no obsolete metadata. */
function elementPaths(svg: string): Map<string, string> {
  const document = parse(svg);
  const roots = Array.isArray(document) ? document : [document];
  const paths = new Map<string, string>();
  const walk = (node: Exclude<Node, string | null>, sourcePath: string, parsedPath: string) => {
    paths.set(sourcePath, parsedPath);
    let elementIndex = 0;
    node.children.forEach((child, index) => {
      if (!child || typeof child !== "object" || child.tagName.startsWith("?")) return;
      walk(child, `${sourcePath}/${elementIndex++}`, `${parsedPath}/${index}`);
    });
  };
  roots.forEach((node, index) => {
    if (node && typeof node === "object" && node.tagName.toLowerCase() === "svg") walk(node, "root", `/${index}`);
  });
  return paths;
}
const svgPaths = Object.fromEntries(Object.entries(input.svgs ?? {}).map(([name,svg]) => [name,elementPaths(svg)]));
const results = input.requests.map(({ tree, attributes }) => {
  const vocabulary = vocabularies[tree];
  if (!vocabulary) throw new Error(`Missing vocabulary: ${tree}`);
  const resolution = resolveAttributes(vocabulary, attributes);
  const evaluation = evaluateAttributeVisibility(vocabulary, resolution.selection);
  const auditLayers = input.trees[tree]!.filter((layer) => layer.legacyId).map((layer) => {
    const key = input.svgs?.[tree] ? svgPaths[tree]!.get(layer.key) : layer.key;
    if (!key || evaluation.visible[key] === undefined) throw new Error(`Missing source layer path: ${tree}:${layer.key}`);
    return { key, id: layer.legacyId };
  });
  return {
    visible: auditLayers.filter((layer) => evaluation.visible[layer.key]).map((layer) => layer.id).sort(),
    diagnostics: [...resolution.diagnostics, ...evaluation.diagnostics],
  };
});
process.stdout.write(JSON.stringify({ results, diagnostics: Object.fromEntries(Object.entries(vocabularies).map(([key, value]) => [key, value.diagnostics])) }));
