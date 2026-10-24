// The parsed artwork a bake works on: every element with its parent, its
// attribute-layer key and label, and its matrix into root user space, plus the
// resource references that decide what each output part has to carry.

import {
  basicShapeToSubpaths,
  parsePathData,
  type BasicShape,
  type Subpath,
} from "@impower/spark-morph/src/index";
import {
  readSVGAttributeDocument,
  SVG_RESOURCE_TAGS,
  type AttributeLayer,
  type AttributeVocabulary,
} from "../attributes";
import type { Node } from "../txml/txml";
import { stringify } from "../txml/txml";
import { IDENTITY, multiply, parseTransform, type Affine } from "./affine";

export type Element = Exclude<Node, string | null>;

export interface ElementInfo {
  element: Element;
  parent: ElementInfo | null;
  /** The attribute-layer key, for elements the vocabulary walks. */
  key?: string;
  layer?: AttributeLayer;
  /** Root user space from this element's own coordinates (its transform included). */
  rootFromElement: Affine | null;
  /** Root user space from the coordinates its children are drawn in. */
  rootFromChildren: Affine | null;
  /** Inside a resource (`defs`, `clipPath`, a gradient, …): never drawn directly. */
  resource: boolean;
}

export interface ArtDocument {
  /** The outermost `<svg>`. */
  root: Element;
  info: Map<Element, ElementInfo>;
  byKey: Map<string, ElementInfo>;
  byId: Map<string, Element>;
  vocabulary: AttributeVocabulary;
}

const SHAPES = new Set(["path", "rect", "circle", "ellipse", "line", "polyline", "polygon"]);
/** Drawn as a unit: their children are content, not separate art. */
const ATOMIC = new Set([...SHAPES, "text", "image", "use", "foreignobject", "svg"]);

export const isShape = (element: Element) => SHAPES.has(element.tagName.toLowerCase());

const elementsOf = (children: Node[]): Element[] =>
  children.filter((c): c is Element => !!c && typeof c === "object");

/** Parses artwork into an indexed document, or returns undefined when there is no `<svg>`. */
export function readArtDocument(svg: string): ArtDocument | undefined {
  const { roots, nodes, vocabulary } = readSVGAttributeDocument(svg);
  const root = elementsOf(roots).find((e) => e.tagName.toLowerCase() === "svg");
  if (!root) return undefined;
  const keyOf = new Map<Element, string>();
  for (const [key, element] of nodes) keyOf.set(element, key);
  const layers = new Map(vocabulary.layers.map((layer) => [layer.key, layer]));
  const info = new Map<Element, ElementInfo>();
  const byKey = new Map<string, ElementInfo>();
  const byId = new Map<string, Element>();
  const visit = (element: Element, parent: ElementInfo | null, resource: boolean) => {
    const tag = element.tagName.toLowerCase();
    const own = parseTransform(element.attributes["transform"]);
    const parentSpace = parent ? parent.rootFromChildren : IDENTITY;
    const rootFromElement = parentSpace && own ? multiply(parentSpace, own) : null;
    // A nested <svg> starts a new viewport; its contents are not mapped here.
    const rootFromChildren = parent && tag === "svg" ? null : rootFromElement;
    const key = keyOf.get(element);
    const entry: ElementInfo = {
      element,
      parent,
      ...(key === undefined ? {} : { key, layer: layers.get(key) }),
      rootFromElement: parent ? rootFromElement : IDENTITY,
      rootFromChildren: parent ? rootFromChildren : IDENTITY,
      resource,
    };
    info.set(element, entry);
    if (key !== undefined) byKey.set(key, entry);
    const id = element.attributes["id"];
    if (id !== undefined && !byId.has(id)) byId.set(id, element);
    const inner = resource || SVG_RESOURCE_TAGS.has(tag);
    for (const child of elementsOf(element.children)) visit(child, entry, inner);
  };
  visit(root, null, false);
  // The root's own transform does not apply to its viewBox content.
  return { root, info, byKey, byId, vocabulary };
}

/**
 * The drawn leaves under `element` in paint order: shapes, text, images and
 * uses, and empty elements that are neither containers nor resources.
 */
export function drawnLeaves(doc: ArtDocument, element: Element = doc.root): Element[] {
  const out: Element[] = [];
  const walk = (e: Element) => {
    const entry = doc.info.get(e);
    if (!entry || entry.resource) return;
    const tag = e.tagName.toLowerCase();
    if (SVG_RESOURCE_TAGS.has(tag)) return;
    if (e !== doc.root && ATOMIC.has(tag)) {
      out.push(e);
      return;
    }
    const kids = elementsOf(e.children);
    if (kids.length === 0) {
      if (e !== doc.root && tag !== "g") out.push(e);
      return;
    }
    for (const child of kids) walk(child);
  };
  walk(element);
  return out;
}

/** The nearest nonempty label on the element or its ancestors. */
export function effectiveLabel(doc: ArtDocument, element: Element): string {
  for (let entry = doc.info.get(element) ?? null; entry; entry = entry.parent) {
    const label = entry.layer?.parsed.label;
    if (label) return label;
  }
  return "";
}

/** The element and its ancestors, nearest first. */
export function* ancestry(doc: ArtDocument, element: Element): Generator<ElementInfo> {
  for (let entry = doc.info.get(element) ?? null; entry; entry = entry.parent) yield entry;
}

export const isAncestorOrSelf = (doc: ArtDocument, ancestor: Element, element: Element) => {
  for (const entry of ancestry(doc, element)) if (entry.element === ancestor) return true;
  return false;
};

const num = (value: string | undefined): number | undefined => {
  if (value === undefined) return undefined;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : undefined;
};

/** The element's geometry in its own user space, or undefined for non-shapes. */
export function localGeometry(element: Element): Subpath[] | undefined {
  const a = element.attributes;
  const tag = element.tagName.toLowerCase();
  let shape: BasicShape;
  switch (tag) {
    case "path":
      try {
        return parsePathData(a["d"] ?? "");
      } catch {
        return [];
      }
    case "rect":
      shape = { kind: "rect", x: num(a["x"]), y: num(a["y"]), width: num(a["width"]) ?? 0, height: num(a["height"]) ?? 0, rx: num(a["rx"]), ry: num(a["ry"]) };
      break;
    case "circle":
      shape = { kind: "circle", cx: num(a["cx"]), cy: num(a["cy"]), r: num(a["r"]) ?? 0 };
      break;
    case "ellipse":
      shape = { kind: "ellipse", cx: num(a["cx"]), cy: num(a["cy"]), rx: num(a["rx"]) ?? 0, ry: num(a["ry"]) ?? 0 };
      break;
    case "line":
      shape = { kind: "line", x1: num(a["x1"]), y1: num(a["y1"]), x2: num(a["x2"]), y2: num(a["y2"]) };
      break;
    case "polyline":
    case "polygon":
      shape = { kind: tag, points: a["points"] ?? "" };
      break;
    default:
      return undefined;
  }
  return basicShapeToSubpaths(shape);
}

const GEOMETRY_ATTRIBUTES = ["x", "y", "width", "height", "rx", "ry", "cx", "cy", "r", "x1", "y1", "x2", "y2", "points", "pathLength"];

/** Turns a basic shape into an equivalent `<path>` in place. */
export function convertToPath(element: Element, d: string) {
  if (element.tagName.toLowerCase() !== "path") {
    for (const name of GEOMETRY_ATTRIBUTES) delete element.attributes[name];
    element.tagName = "path";
  }
  element.attributes["d"] = d;
}

// References to other elements: `url(#id)` in any attribute or style text,
// and `href`/`xlink:href` pointing into the document.
const URL_REF = /url\(\s*(['"]?)#([^'")\s]+)\1\s*\)/g;

export function referencedIds(element: Element): string[] {
  const ids: string[] = [];
  for (const [name, value] of Object.entries(element.attributes)) {
    if (typeof value !== "string") continue;
    if ((name === "href" || name === "xlink:href") && value.startsWith("#")) ids.push(value.slice(1));
    for (const match of value.matchAll(URL_REF)) ids.push(match[2]!);
  }
  if (element.tagName.toLowerCase() === "style") {
    for (const child of element.children) {
      if (typeof child === "string") for (const match of child.matchAll(URL_REF)) ids.push(match[2]!);
    }
  }
  return ids;
}

/** Every element in a subtree, the root included. */
export function subtree(element: Element): Element[] {
  const out: Element[] = [element];
  for (const child of elementsOf(element.children)) out.push(...subtree(child));
  return out;
}

/**
 * The ids `elements` need, transitively: a gradient that inherits another,
 * a clip path whose contents use a pattern. `missing` collects references
 * that name nothing in the document.
 */
export function resourceClosure(
  doc: ArtDocument,
  elements: Iterable<Element>,
  missing?: Set<string>,
): Set<string> {
  const needed = new Set<string>();
  const queue = [...elements].flatMap(subtree);
  while (queue.length) {
    const element = queue.pop()!;
    for (const id of referencedIds(element)) {
      if (needed.has(id)) continue;
      const target = doc.byId.get(id);
      if (!target) {
        missing?.add(id);
        continue;
      }
      needed.add(id);
      queue.push(...subtree(target));
    }
  }
  return needed;
}

export const cloneElement = (element: Element, deep = true): Element => ({
  tagName: element.tagName,
  attributes: { ...element.attributes },
  children: deep
    ? element.children.map((c) => (c && typeof c === "object" ? cloneElement(c) : c))
    : [],
});

/**
 * Prefixes every id in a tree and every reference to an id in `known`:
 * `url(#…)` in attributes and style text, `href`, and `#id` selectors in
 * `<style>` rules. References to unknown ids are left as written.
 */
export function namespaceTree(root: Element, prefix: string, known: ReadonlySet<string>) {
  const rewriteUrls = (text: string) =>
    text.replace(URL_REF, (whole, quote: string, id: string) =>
      known.has(id) ? `url(${quote}#${prefix}${id}${quote})` : whole,
    );
  const walk = (element: Element) => {
    for (const [name, value] of Object.entries(element.attributes)) {
      if (typeof value !== "string") continue;
      if (name === "id") element.attributes[name] = prefix + value;
      else if ((name === "href" || name === "xlink:href") && value.startsWith("#") && known.has(value.slice(1))) {
        element.attributes[name] = `#${prefix}${value.slice(1)}`;
      } else if (value.includes("url(")) element.attributes[name] = rewriteUrls(value);
    }
    if (element.tagName.toLowerCase() === "style") {
      element.children = element.children.map((c) =>
        typeof c === "string" ? rewriteStyleSheet(c, prefix, known, rewriteUrls) : c,
      );
    }
    for (const child of elementsOf(element.children)) walk(child);
  };
  walk(root);
}

// Selectors sit outside braces; `#abc` inside a block is a colour.
function rewriteStyleSheet(
  css: string,
  prefix: string,
  known: ReadonlySet<string>,
  rewriteUrls: (text: string) => string,
): string {
  let out = "";
  let depth = 0;
  let run = "";
  const flush = () => {
    out += depth === 0
      ? run.replace(/#(-?[_a-zA-Z][-_a-zA-Z0-9]*)/g, (whole, id: string) => (known.has(id) ? `#${prefix}${id}` : whole))
      : rewriteUrls(run);
    run = "";
  };
  for (const ch of css) {
    if (ch === "{" || ch === "}") {
      flush();
      out += ch;
      depth = Math.max(0, depth + (ch === "{" ? 1 : -1));
    } else run += ch;
  }
  flush();
  return out;
}

export const serialize = (element: Element): string =>
  stringify([element], { quote: "'", selfClosingTags: ["path"] });

/**
 * A copy of the document keeping only `keep` (and every ancestor of a kept
 * element, with its attributes) plus the resources they reference. Resource
 * elements outside the kept tree are copied into a leading `<defs>`; every
 * `<style>` element is carried so class rules still apply.
 */
export function extractTree(
  doc: ArtDocument,
  keep: ReadonlySet<Element>,
  options: { extra?: Map<Element, (clone: Element) => Element>; missing?: Set<string> } = {},
): { root: Element; ids: Set<string> } {
  const keepUp = new Set<Element>();
  for (const element of keep) for (const entry of ancestry(doc, element)) keepUp.add(entry.element);
  const kept = new Set<Element>();
  const copy = (element: Element, whole: boolean): Element | undefined => {
    const inKeep = whole || keep.has(element);
    if (!inKeep && !keepUp.has(element)) return undefined;
    const clone = cloneElement(element, false);
    kept.add(element);
    for (const child of element.children) {
      if (child && typeof child === "object") {
        const tag = child.tagName.toLowerCase();
        // Every style sheet is carried once, at the top.
        if (tag === "style") continue;
        if (!inKeep && SVG_RESOURCE_TAGS.has(tag)) continue;
        const c = copy(child, inKeep);
        if (c) clone.children.push(c);
      } else if (inKeep) clone.children.push(child);
    }
    const wrap = options.extra?.get(element);
    return wrap ? wrap(clone) : clone;
  };
  const root = copy(doc.root, false) ?? cloneElement(doc.root, false);
  // Every part carries every style sheet, so whatever a sheet references
  // (`.skin { fill: url(#skin) }`) is part of every part's closure.
  const sheets = subtree(doc.root).filter((e) => e.tagName.toLowerCase() === "style");
  const closure = resourceClosure(doc, [...keep, ...sheets], options.missing);
  // Containers kept for their children still carry their own references.
  for (const element of keepUp) {
    for (const id of referencedIds(element)) {
      const target = doc.byId.get(id);
      if (!target) {
        options.missing?.add(id);
        continue;
      }
      for (const nested of resourceClosure(doc, [target], options.missing)) closure.add(nested);
      closure.add(id);
    }
  }
  const defs: Element = { tagName: "defs", attributes: {}, children: [] };
  for (const id of closure) {
    const target = doc.byId.get(id)!;
    if (kept.has(target)) continue;
    // Already inside a resource copied whole above.
    let insideCopied = false;
    for (const entry of ancestry(doc, target)) {
      if (entry.element !== target && closure.has(entry.element.attributes["id"] ?? "")) insideCopied = true;
    }
    if (!insideCopied) defs.children.push(cloneElement(target));
  }
  const styles = sheets.map((e) => cloneElement(e));
  const leading = [...styles, ...(defs.children.length ? [defs] : [])];
  if (leading.length) root.children.unshift(...leading);
  const ids = new Set<string>();
  for (const element of subtree(root)) {
    const id = element.attributes["id"];
    if (id !== undefined) ids.add(id);
  }
  return { root, ids };
}
