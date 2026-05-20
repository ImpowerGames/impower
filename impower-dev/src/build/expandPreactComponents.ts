import { parseFragment, serialize } from "parse5";
import type {
  ChildNode,
  DocumentFragment,
  Element,
  TextNode,
} from "parse5/dist/tree-adapters/default";
import { type ComponentChildren, type ComponentType, h } from "preact";
import { renderToString } from "preact-render-to-string";
import { ComponentSpec } from "./ComponentSpec.js";
import expandComponents from "./expandComponents.js";

export type ComponentRegistry = Record<string, ComponentType<any>>;

export type ExpandOptions = {
  // When provided, spec-component tags emitted by Preact components get
  // expanded inline (same pass) instead of needing a separate second
  // walker. Reparsing the whole body to do that with expandHtml loses
  // custom-element tags nested under an inline <style>.
  specComponents?: Record<string, ComponentSpec>;
};

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
  options?: ExpandOptions,
): void => {
  for (const child of parent.childNodes) {
    if (!isElement(child)) continue;
    const Component = registry[child.tagName];
    if (Component) {
      const props = attrsToProps(child.attrs);
      const childVNodes = child.childNodes.map(nodeToVNode);
      // Best-effort SSR. A component may not render cleanly outside the
      // browser (e.g. react-resizable-panels' SplitPane reaches for a real
      // React's useRef during render). In that case, leave the tag's empty
      // shell in place — the browser will hydrate it post-load. We lose the
      // FOUC-prevention benefit for this subtree but the rest of the page
      // still gets statically rendered.
      let rendered: string | null = null;
      try {
        rendered = renderToString(h(Component, props, ...childVNodes));
      } catch (err) {
        console.warn(
          `[expandPreactComponents] SSR of <${child.tagName}> failed:`,
          err instanceof Error ? err.message : err,
        );
      }
      if (rendered !== null) {
        const fragment = parseFragment(rendered);
        child.childNodes = fragment.childNodes;
        for (const c of child.childNodes) {
          (c as { parentNode?: typeof child }).parentNode = child;
        }
        // Recurse to expand nested Preact tags emitted by this component.
        expandIn(child, registry, options);
        // Then expand any spec-component tags emitted by this component (so
        // the page ships fully-rendered including the legacy spec-component
        // sub-elements that Preact-ported parents reference, e.g.
        // <se-header-menu-button> inside HeaderNavigation).
        if (options?.specComponents) {
          expandComponents(child, options.specComponents);
        }
      }
    } else {
      expandIn(child, registry, options);
    }
  }
};

export const expandPreactComponents = (
  html: string,
  registry: ComponentRegistry,
  options?: ExpandOptions,
): string => {
  const doc = parseFragment(html);
  expandIn(doc, registry, options);
  return serialize(doc);
};
