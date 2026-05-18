import { parseFragment, serialize } from "parse5";
import type {
  ChildNode,
  DocumentFragment,
  Element,
  TextNode,
} from "parse5/dist/tree-adapters/default";
import { type ComponentChildren, type ComponentType, h } from "preact";
import { renderToString } from "preact-render-to-string";

export type ComponentRegistry = Record<string, ComponentType<any>>;

const kebabToCamel = (s: string): string =>
  s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

const isElement = (node: ChildNode): node is Element =>
  "tagName" in node && node.nodeName !== "#comment";

const isTextNode = (node: ChildNode): node is TextNode =>
  node.nodeName === "#text";

const attrsToProps = (
  attrs: Element["attrs"],
): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const { name, value } of attrs) {
    out[name] = value;
    const camel = kebabToCamel(name);
    if (camel !== name) out[camel] = value;
  }
  return out;
};

// Convert parse5 nodes to Preact vnodes / strings so they can be passed as
// `children` to a Preact component for SSR rendering.
const nodeToVNode = (node: ChildNode): ComponentChildren => {
  if (isTextNode(node)) return node.value;
  if (!isElement(node)) return null;
  const props = attrsToProps(node.attrs);
  const children = node.childNodes.map(nodeToVNode);
  return h(node.tagName, props, ...children);
};

// Walk a parse5 tree, expanding any registered custom-element tag in-place by
// running it through preact-render-to-string. Recurses into the rendered
// output as well so nested registered tags get expanded transitively.
const expandIn = (
  parent: DocumentFragment | Element,
  registry: ComponentRegistry,
): void => {
  for (const child of parent.childNodes) {
    if (!isElement(child)) continue;
    const Component = registry[child.tagName];
    if (Component) {
      const props = attrsToProps(child.attrs);
      const childVNodes = child.childNodes.map(nodeToVNode);
      const rendered = renderToString(h(Component, props, ...childVNodes));
      // Replace the tag's inner content with the rendered HTML, keeping the
      // outer custom-element tag intact so the browser still upgrades it.
      const fragment = parseFragment(rendered);
      child.childNodes = fragment.childNodes;
      for (const c of child.childNodes) {
        (c as { parentNode?: typeof child }).parentNode = child;
      }
      // Recurse in case the rendered output contains more registered tags.
      expandIn(child, registry);
    } else {
      expandIn(child, registry);
    }
  }
};

export const expandPreactComponents = (
  html: string,
  registry: ComponentRegistry,
): string => {
  const doc = parseFragment(html);
  expandIn(doc, registry);
  return serialize(doc);
};
