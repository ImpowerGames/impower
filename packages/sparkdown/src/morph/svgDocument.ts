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
import { cssTrim, readAlpha } from "./color";

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
  /** The first style sheet the artwork carries or may carry, as written; the bake refuses it. */
  styleSheet?: string;
}

const SHAPES = new Set(["path", "rect", "circle", "ellipse", "line", "polyline", "polygon"]);
/** Drawn as a unit: their children are content, not separate art. */
const ATOMIC = new Set([...SHAPES, "text", "image", "use", "foreignobject", "svg"]);

export const isShape = (element: Element) => SHAPES.has(element.tagName.toLowerCase());

/**
 * CSS text of the same length with comments blanked and the contents of
 * strings replaced by `x`, so braces, semicolons, colons and `!important`
 * found in it are the real ones. Positions match the original text, so a
 * structure found here slices the original.
 */
export function maskCss(css: string): string {
  const out = css.split("");
  let i = 0;
  while (i < css.length) {
    const ch = css[i]!;
    if (ch === "/" && css[i + 1] === "*") {
      const close = css.indexOf("*/", i + 2);
      const end = close < 0 ? css.length : close + 2;
      for (let k = i; k < end; k++) out[k] = " ";
      i = end;
    } else if (ch === '"' || ch === "'") {
      let k = i + 1;
      while (k < css.length && css[k] !== ch && css[k] !== "\n") {
        // An escape keeps the next character inside the string.
        const width = css[k] === "\\" ? 2 : 1;
        for (let n = k; n < Math.min(k + width, css.length); n++) out[n] = "x";
        k += width;
      }
      i = k + 1;
    } else if (/^url\(\s*[^\s"')]/i.test(css.slice(i, i + 64))) {
      // An unquoted url is one token, `;` and braces included (a data URI).
      const open = css.indexOf("(", i);
      const close = css.indexOf(")", open);
      const end = close < 0 ? css.length : close;
      for (let k = open + 1; k < end; k++) if (";{}".includes(css[k]!)) out[k] = "x";
      i = end;
    } else i++;
  }
  return out.join("");
}

/**
 * The declarations of an inline `style` attribute, in order: name, value as
 * written, and the value with comments blanked and strings masked, which is
 * what to read `!important` and keywords from.
 */
export function styleDeclarations(element: Element): [string, string, string][] {
  const style = element.attributes["style"] ?? "";
  const masked = maskCss(style);
  const out: [string, string, string][] = [];
  let start = 0;
  for (let end = 0; end <= masked.length; end++) {
    if (end < masked.length && masked[end] !== ";") continue;
    const colon = masked.indexOf(":", start);
    if (colon >= 0 && colon < end) {
      const name = masked.slice(start, colon).trim().toLowerCase();
      if (name) out.push([name, style.slice(colon + 1, end).trim(), masked.slice(colon + 1, end).trim()]);
    }
    start = end + 1;
  }
  return out;
}

const IMPORTANT = /!\s*important\s*$/i;

/**
 * The inline style declaration of `name` that takes effect, which outranks
 * the presentation attribute of that name: the last important one if any is
 * important, else the last. `value` has its `!important` and comments
 * removed (and strings masked).
 */
export function styleDeclaration(element: Element, name: string): { value: string; important: boolean } | undefined {
  const declared = styleDeclarations(element).filter(([n]) => n === name);
  const chosen = declared.findLast(([, , clean]) => IMPORTANT.test(clean)) ?? declared[declared.length - 1];
  if (!chosen) return undefined;
  return { value: chosen[2].replace(IMPORTANT, "").trim(), important: IMPORTANT.test(chosen[2]) };
}

/** The value of the inline style declaration of `name` that takes effect. */
export const styleProperty = (element: Element, name: string): string | undefined =>
  styleDeclaration(element, name)?.value;

/** Sets (or, with `undefined`, removes) one inline style property. */
export function setStyleProperty(element: Element, name: string, value: string | undefined) {
  const kept: [string, string][] = styleDeclarations(element).filter(([n]) => n !== name).map(([n, v]) => [n, v]);
  if (value !== undefined) kept.push([name, value]);
  if (kept.length) element.attributes["style"] = kept.map(([n, v]) => `${n}:${v}`).join(";");
  else delete element.attributes["style"];
}

// The inline style grammar the bake reads: names and values in ASCII with
// space, tab and line breaks between tokens, declarations ended by `;`, each
// with an optional trailing `!important`. Other text changes where a browser
// ends a declaration or what it reads there, which a plain split does not
// follow: non-ASCII text and other whitespace, a character reference (the
// parser keeps `&…;` as written, and a browser decodes it before reading the
// declaration), a comment, an escape, a string, a brace or bracket block, and
// a parenthesis left open or holding a semicolon. Reading less than a browser
// does is safe; reading something differently is not.

/** Text outside the inline style grammar wherever it appears. */
const STYLE_OUTSIDE = /[^\x20-\x7e\t\n\r\f]|\/\*|\\|["'{}[\]&]/;

const STYLE_IMPORTANT = /![ \t\n\r\f]*important$/i;

export interface InlineDeclaration {
  /** Lowercased. */
  name: string;
  /** As written, without its `!important`. */
  value: string;
  important: boolean;
}

/** Where an inline style leaves the grammar, or -1 when it stays inside it. */
function styleOutsideAt(style: string): number {
  const outside = STYLE_OUTSIDE.exec(style);
  if (outside) return outside.index;
  let depth = 0;
  let open = -1;
  for (let i = 0; i < style.length; i++) {
    const ch = style[i];
    if (ch === "(" && depth++ === 0) open = i;
    // A stray `)` is an ordinary token to a browser.
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === ";" && depth > 0) return open;
  }
  return depth > 0 ? open : -1;
}

/** An element's inline style declarations in order, or null for a style outside the grammar. */
export function inlineDeclarations(element: Element): InlineDeclaration[] | null {
  const style = element.attributes["style"];
  if (style === undefined) return [];
  if (styleOutsideAt(style) >= 0) return null;
  const out: InlineDeclaration[] = [];
  for (const declaration of style.split(";")) {
    const colon = declaration.indexOf(":");
    if (colon < 0) continue;
    const name = cssTrim(declaration.slice(0, colon)).toLowerCase();
    const value = cssTrim(declaration.slice(colon + 1));
    const important = STYLE_IMPORTANT.test(value);
    if (name) out.push({ name, value: important ? cssTrim(value.replace(STYLE_IMPORTANT, "")) : value, important });
  }
  return out;
}

const CSS_WIDE_KEYWORDS = new Set(["inherit", "initial", "unset", "revert", "revert-layer"]);
const SUBSTITUTION = /(?:^|[^a-z0-9_-])(?:var|env|attr)\(/i;

/**
 * The `display` values the bake reads: `none` and single keywords every
 * browser accepts and draws an SVG element with. A browser drops a value it
 * does not accept, so an earlier declaration takes effect instead, and
 * `contents` hides most SVG elements; neither can be read as showing.
 */
const DISPLAY_KEYWORDS = new Set([
  "none",
  "inline",
  "block",
  "inline-block",
  "flow-root",
  "flex",
  "inline-flex",
  "grid",
  "inline-grid",
  "list-item",
  "table",
  "inline-table",
  "table-row-group",
  "table-header-group",
  "table-footer-group",
  "table-row",
  "table-cell",
  "table-column-group",
  "table-column",
  "table-caption",
]);

/**
 * Whether the bake can read a declaration's value the way a browser does.
 * Only a value the browser accepts takes effect, so where the bake reads
 * structure by value (`display` and the compositing properties), a value it
 * cannot vouch for could leave an earlier declaration in force unseen.
 */
const readableDeclaration = ({ name, value }: InlineDeclaration): boolean => {
  // Anything but one trailing `!important` is outside the grammar.
  if (name === "all" || value.includes("!") || SUBSTITUTION.test(value)) return false;
  const keyword = value.toLowerCase();
  if (name === "display") return DISPLAY_KEYWORDS.has(keyword);
  if (name === "opacity") return readAlpha(value) !== undefined;
  if (COMPOSITING.includes(name)) return value !== "" && !CSS_WIDE_KEYWORDS.has(keyword);
  return true;
};

/** Shows each character outside printable ASCII as its code point. */
const visible = (text: string) =>
  text.replace(/[^\x20-\x7e]/g, (ch) => `<U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}>`);

/**
 * The declaration that keeps the bake from reading an element's styling
 * safely, as written, or undefined: an inline style outside the grammar, an
 * `all` declaration, a substituted value (`var()`, `env()`, `attr()`), a `!`
 * other than one trailing `!important`, a `display` value other than the
 * keywords the bake reads, an empty or CSS-wide value of a compositing
 * property, or an opacity, inline or as an attribute, that is not a number
 * or a percentage (`calc()` among them).
 */
export function unreadableStyle(element: Element): string | undefined {
  const opacity = element.attributes["opacity"];
  if (opacity !== undefined && readAlpha(opacity) === undefined) return visible(`opacity="${opacity}"`);
  const style = element.attributes["style"];
  if (style === undefined) return undefined;
  const at = styleOutsideAt(style);
  if (at >= 0) {
    // The declaration it happens in; an open parenthesis runs to the end, and
    // a character reference's own `;` ends nothing.
    const start = style.lastIndexOf(";", at) + 1;
    const reference = style[at] === "&" ? style.indexOf(";", at) : -1;
    const next = STYLE_OUTSIDE.exec(style)?.index === at ? style.indexOf(";", reference < 0 ? at : reference + 1) : -1;
    return visible(cssTrim(style.slice(start, next < 0 ? style.length : next)));
  }
  const unreadable = inlineDeclarations(element)!.find((declaration) => !readableDeclaration(declaration));
  return unreadable && [`${unreadable.name}:`, unreadable.value, unreadable.important ? "!important" : ""].filter(Boolean).join(" ");
}

/** Properties that make an element composite its content as one group. */
const COMPOSITING = ["opacity", "filter", "mask", "mix-blend-mode", "isolation"];

/** Whether a declared value of a compositing property actually composites. */
export const compositingValue = (name: string, value: string): boolean => {
  const v = cssTrim(value.replace(IMPORTANT, "")).toLowerCase();
  if (!COMPOSITING.includes(name)) return false;
  // An opacity the reader cannot read may still be below 1, so it keeps its
  // group whole; the bake refuses such an opacity before it asks.
  if (name === "opacity") return (readAlpha(v) ?? 0) < 1;
  return v !== "" && v !== "none" && v !== "normal" && v !== "auto";
};

/**
 * The first style sheet the parsed artwork carries or may carry, named as
 * written, wherever it sits: a `<style>` element (namespaced or not, empty or
 * not), a `<link>` element (its relationship may be spelled with character
 * references the parser keeps, so every link counts), an `<?xml-stylesheet?>`
 * instruction, or a DOCTYPE with an internal subset, whose entities a browser
 * expands into markup the parser never sees.
 */
function findStyleSheet(nodes: Node[]): string | undefined {
  for (const node of nodes) {
    if (typeof node === "string") {
      if (/^!DOCTYPE[^>]*\[/i.test(node.trim())) return "<!DOCTYPE … [ … ]>";
      continue;
    }
    if (!node) continue;
    const tag = node.tagName.toLowerCase();
    const local = tag.slice(tag.lastIndexOf(":") + 1);
    if (tag.startsWith("?xml-stylesheet")) return `<${node.tagName}?>`;
    if (local === "style" || local === "link") return `<${node.tagName}>`;
    const inner = findStyleSheet(node.children);
    if (inner) return inner;
  }
  return undefined;
}

/**
 * Whether the element is authored not to render at all, from the inline
 * `display` declaration that takes effect or else its `display` attribute.
 * Artwork with a style sheet, or an inline style the bake cannot read
 * safely, is never baked live, so no sheet rule or unread declaration
 * decides it.
 */
export const authoredHidden = (element: Element) => {
  const display = styleProperty(element, "display") ?? element.attributes["display"];
  return display !== undefined && cssTrim(display).toLowerCase() === "none";
};

/** Inline style properties that move an element where its `transform` attribute does not say. */
const CSS_TRANSFORM_PROPERTIES = new Set([
  "transform",
  "transform-origin",
  "transform-box",
  "translate",
  "rotate",
  "scale",
  "offset",
  "offset-path",
  "offset-distance",
  "offset-rotate",
  "offset-anchor",
  "offset-position",
]);

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
    // CSS transform properties in an inline style outrank the attribute, and
    // `transform-origin` moves its pivot, so neither can be followed.
    const cssTransform =
      element.attributes["transform-origin"] !== undefined ||
      styleDeclarations(element).some(([name]) => CSS_TRANSFORM_PROPERTIES.has(name));
    const own = cssTransform ? null : parseTransform(element.attributes["transform"]);
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
  const styleSheet = findStyleSheet(roots);
  return { root, info, byKey, byId, vocabulary, ...(styleSheet ? { styleSheet } : {}) };
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
    // Art the author hid draws nothing, so it is no part's leaf.
    if (e !== doc.root && authoredHidden(e)) return;
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

/** A user-space number: unitless or in `px`. */
const USER_LENGTH = /^[ \t\n\r\f]*[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?(?:px)?[ \t\n\r\f]*$/i;
const LENGTH_ATTRIBUTES: Record<string, string[]> = {
  rect: ["x", "y", "width", "height", "rx", "ry"],
  circle: ["cx", "cy", "r"],
  ellipse: ["cx", "cy", "rx", "ry"],
  line: ["x1", "y1", "x2", "y2"],
};
/** Geometry properties an inline style can set, outranking the attributes. */
const GEOMETRY_PROPERTIES = new Set(["x", "y", "width", "height", "rx", "ry", "cx", "cy", "r", "d"]);

/**
 * What keeps the bake from reading a shape's geometry exactly, or undefined:
 * a length in a unit other than `px` (a percentage resolves against the
 * viewport, `em` against the font), or an inline style that sets a geometry
 * property. Such a drawing has no geometry to morph or scale.
 */
export function unreadableGeometry(element: Element): string | undefined {
  const declared = styleDeclarations(element).find(([name]) => GEOMETRY_PROPERTIES.has(name));
  if (declared) return `style \`${declared[0]}: ${declared[1]}\``;
  for (const name of LENGTH_ATTRIBUTES[element.tagName.toLowerCase()] ?? []) {
    const value = element.attributes[name];
    if (value === undefined || USER_LENGTH.test(value)) continue;
    if ((name === "rx" || name === "ry") && cssTrim(value).toLowerCase() === "auto") continue;
    return `\`${name}="${value}"\``;
  }
  return undefined;
}

/** Turns a basic shape into an equivalent `<path>` in place. */
export function convertToPath(element: Element, d: string) {
  if (element.tagName.toLowerCase() !== "path") {
    for (const name of GEOMETRY_ATTRIBUTES) delete element.attributes[name];
    element.tagName = "path";
  }
  element.attributes["d"] = d;
}

// References to other elements: `url(#id)` in any attribute, an inline
// style included, and `href`/`xlink:href` pointing into the document.
const URL_REF = /url\(\s*(['"]?)#([^'")\s]+)\1\s*\)/g;

// The ids `url(#…)` names in an inline style, outside comments and strings.
const cssUrlIds = (css: string): string[] => {
  const masked = maskCss(css);
  return [...css.matchAll(URL_REF)]
    .filter((match) => masked.slice(match.index!, match.index! + 4).toLowerCase() === "url(")
    .map((match) => match[2]!);
};

export function referencedIds(element: Element): string[] {
  const ids: string[] = [];
  for (const [name, value] of Object.entries(element.attributes)) {
    if (typeof value !== "string") continue;
    if ((name === "href" || name === "xlink:href") && value.startsWith("#")) ids.push(value.slice(1));
    ids.push(...(name === "style" ? cssUrlIds(value) : [...value.matchAll(URL_REF)].map((match) => match[2]!)));
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
 * a clip path whose contents use a pattern, and what a needed resource's
 * ancestors reference, since a copied resource repeats what they pass down
 * (a pattern under `<defs fill="url(#paint)">` needs `#paint`). `missing`
 * collects references that name nothing in the document.
 */
function resourceClosure(
  doc: ArtDocument,
  elements: Iterable<Element>,
  missing?: Set<string>,
  // Elements whose own references count, without their subtrees.
  alone: Iterable<Element> = [],
): Set<string> {
  const needed = new Set<string>();
  const queue = [...[...elements].flatMap(subtree), ...alone];
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
      for (const entry of ancestry(doc, target)) if (entry.element !== target) queue.push(entry.element);
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
 * `url(#…)` in attributes (an inline style included) and `href`. References
 * to unknown ids are left as written.
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
    for (const child of elementsOf(element.children)) walk(child);
  };
  walk(root);
}

export const serialize = (element: Element): string =>
  stringify([element], { quote: "'", selfClosingTags: ["path"] });

/** Attributes that describe one element rather than what it passes down. */
const OWN_ATTRIBUTES = new Set(["id", "transform", "data-name"]);

/**
 * A resource copied out of its place, inside groups that repeat what its
 * original ancestors (below the root, which every part copies) passed down:
 * a `currentColor` stop under `<defs color="lime">` stays lime. Ids stay
 * with the original, and an ancestor's transform does not apply to a paint
 * server or a clip path.
 */
function withInheritance(doc: ArtDocument, target: Element, clone: Element): Element {
  let out = clone;
  for (const entry of ancestry(doc, target)) {
    if (entry.element === target || entry.element === doc.root) continue;
    const attributes: Record<string, string> = {};
    for (const [name, value] of Object.entries(entry.element.attributes)) {
      if (!OWN_ATTRIBUTES.has(name) && typeof value === "string") attributes[name] = value;
    }
    if (Object.keys(attributes).length) out = { tagName: "g", attributes, children: [out] };
  }
  return out;
}

/** `keep` and every ancestor of a kept element. */
function keptAncestry(doc: ArtDocument, keep: Iterable<Element>): Set<Element> {
  const keepUp = new Set<Element>();
  for (const element of keep) for (const entry of ancestry(doc, element)) keepUp.add(entry.element);
  return keepUp;
}

/**
 * Every id a part keeping `keep` depends on: what the kept subtrees
 * reference, transitively, and what the ancestors kept for them reference
 * themselves (a group's `clip-path`).
 */
export function partClosure(doc: ArtDocument, keep: Iterable<Element>, missing?: Set<string>): Set<string> {
  const kept = [...keep];
  // Containers kept for their children still carry their own references, and
  // what those reference is closed over like any other resource.
  return resourceClosure(doc, kept, missing, keptAncestry(doc, kept));
}

/**
 * A copy of the document keeping only `keep` (and every ancestor of a kept
 * element, with its attributes) plus the resources they reference. Resource
 * elements outside the kept tree are copied into a leading `<defs>`.
 */
export function extractTree(
  doc: ArtDocument,
  keep: ReadonlySet<Element>,
  options: { extra?: Map<Element, (clone: Element) => Element>; missing?: Set<string> } = {},
): { root: Element; ids: Set<string> } {
  const keepUp = keptAncestry(doc, keep);
  const kept = new Set<Element>();
  const copy = (element: Element, whole: boolean): Element | undefined => {
    const inKeep = whole || keep.has(element);
    if (!inKeep && !keepUp.has(element)) return undefined;
    const clone = cloneElement(element, false);
    kept.add(element);
    for (const child of element.children) {
      if (child && typeof child === "object") {
        const tag = child.tagName.toLowerCase();
        if (!inKeep && SVG_RESOURCE_TAGS.has(tag)) continue;
        const c = copy(child, inKeep);
        if (c) clone.children.push(c);
      } else if (inKeep) clone.children.push(child);
    }
    const wrap = options.extra?.get(element);
    return wrap ? wrap(clone) : clone;
  };
  const root = copy(doc.root, false) ?? cloneElement(doc.root, false);
  const closure = partClosure(doc, keep, options.missing);
  const defs: Element = { tagName: "defs", attributes: {}, children: [] };
  for (const id of closure) {
    const target = doc.byId.get(id)!;
    if (kept.has(target)) continue;
    // Already inside a resource copied whole above.
    let insideCopied = false;
    for (const entry of ancestry(doc, target)) {
      if (entry.element !== target && closure.has(entry.element.attributes["id"] ?? "")) insideCopied = true;
    }
    if (!insideCopied) defs.children.push(withInheritance(doc, target, cloneElement(target)));
  }
  if (defs.children.length) root.children.unshift(defs);
  const ids = new Set<string>();
  for (const element of subtree(root)) {
    const id = element.attributes["id"];
    if (id !== undefined) ids.add(id);
  }
  return { root, ids };
}
