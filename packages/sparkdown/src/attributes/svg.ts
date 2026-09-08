import { type Document, type Node, parse, stringify } from "../txml/txml";
import type {
  AttributeLayerInput,
  AttributeSelection,
  AttributeVocabulary,
} from "./types";
import { evaluateAttributeVisibility } from "./visibility";
import { ATTRIBUTE_ROOT, buildAttributeVocabulary } from "./vocabulary";

type Element = Exclude<Node, string | null>;

export const decodeSVGSource = (source: string): string => {
  if (!/^data:image\/svg\+xml[;,]/i.test(source)) return source;
  const comma = source.indexOf(",");
  if (comma < 0) return source;
  const header = source.slice(0, comma);
  const payload = source.slice(comma + 1);
  if (/;base64$/i.test(header)) {
    return new TextDecoder().decode(
      Uint8Array.from(atob(payload), (char) => char.charCodeAt(0)),
    );
  }
  // buildSVGSource historically only escaped '#' and allowed literal '%'
  // (e.g. width='100%'), so decode valid runs without rejecting those files.
  return payload.replace(/(?:%[a-f0-9]{2})+/gi, (encoded) => {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded;
    }
  });
};

/** Add original export labels without changing IDs, references or geometry.
 * Copy the original quoted XML value verbatim, keeping entity escaping intact. */
export const normalizeSVGAttributeNames = (svg: string): string =>
  svg.replace(
    /<[A-Za-z][\w:.-]*(?:\s+(?:[^<>"']|"[^"]*"|'[^']*')*)?\s*\/?>/g,
    (tag) => {
      const attributes = new Map(
        [
          ...tag.matchAll(
            /\s(data-name|serif:id|inkscape:label)\s*=\s*("[^"]*"|'[^']*')/g,
          ),
        ].map((match) => [match[1], match[2]]),
      );
      if (attributes.has("data-name")) return tag;
      const label =
        attributes.get("serif:id") ?? attributes.get("inkscape:label");
      return label
        ? tag.replace(/(\/?>)$/, (end) => ` data-name=${label}${end}`)
        : tag;
    },
  );

// Definitions are referenced resources, not conditional artwork. Their IDs
// must survive even when they resemble a group.option name.
const resources = new Set([
  "defs",
  "clippath",
  "mask",
  "lineargradient",
  "radialgradient",
  "pattern",
  "filter",
  "marker",
  "symbol",
  "metadata",
  "style",
  "title",
  "desc",
]);

const readDocumentLayers = (
  document: Document,
): { inputs: AttributeLayerInput[]; nodes: Map<string, Element> } => {
  const inputs: AttributeLayerInput[] = [];
  const nodes = new Map<string, Element>();
  const walk = (children: Node[], parent: string, path: string) => {
    children.forEach((node, index) => {
      if (!node || typeof node !== "object") return;
      const key = `${path}/${index}`;
      const tag = node.tagName.toLowerCase();
      if (resources.has(tag)) return;
      if (tag === "svg" || tag.startsWith("?")) {
        walk(node.children, parent, key);
        return;
      }
      const name =
        node.attributes["data-name"] ??
        node.attributes["serif:id"] ??
        node.attributes["inkscape:label"] ??
        node.attributes["id"] ??
        "";
      inputs.push({
        key,
        name,
        parent,
        ...(node.attributes["id"] === undefined
          ? {}
          : { id: node.attributes["id"] }),
      });
      nodes.set(key, node);
      walk(node.children, key, key);
    });
  };
  walk(Array.isArray(document) ? document : [document], ATTRIBUTE_ROOT, "");
  return { inputs, nodes };
};

export const buildSVGAttributeVocabulary = (svg: string): AttributeVocabulary =>
  buildAttributeVocabulary(
    readDocumentLayers(parse(decodeSVGSource(svg))).inputs,
  );

export const filterSVGAttributes = (
  svg: string,
  selection: AttributeSelection,
): string => {
  const document = parse(decodeSVGSource(svg));
  const { inputs, nodes } = readDocumentLayers(document);
  const vocabulary = buildAttributeVocabulary(inputs);
  const { visible } = evaluateAttributeVisibility(vocabulary, selection);
  const hidden = new Set(
    [...nodes].filter(([key]) => !visible[key]).map(([, node]) => node),
  );
  const prune = (children: Node[]) => {
    for (let index = children.length - 1; index >= 0; index--) {
      const node = children[index];
      if (node && typeof node === "object") {
        if (hidden.has(node)) children.splice(index, 1);
        else prune(node.children);
      }
    }
  };
  const roots = Array.isArray(document) ? document : [document];
  prune(roots);
  const filtered = stringify(roots, { quote: "'", selfClosingTags: ["path"] });
  return /^data:image\/svg\+xml[;,]/i.test(svg)
    ? `data:image/svg+xml,${encodeURIComponent(filtered)}`
    : filtered;
};
