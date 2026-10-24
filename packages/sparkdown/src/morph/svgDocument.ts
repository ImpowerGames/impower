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

/** Properties that make an element composite its content as one group. */
const COMPOSITING = ["opacity", "filter", "mask", "mix-blend-mode", "isolation"];

/** Whether a declared value of a compositing property actually composites. */
export const compositingValue = (name: string, value: string): boolean => {
  const v = value.replace(IMPORTANT, "").trim().toLowerCase();
  if (!COMPOSITING.includes(name)) return false;
  if (name === "opacity") {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) && n < 1;
  }
  return v !== "" && v !== "none" && v !== "normal" && v !== "auto";
};

/**
 * What the document's style sheets give some declarations to, by the simple
 * selectors named in the rules that make them. This over-approximates on
 * purpose: a rule `.face .dim { opacity: .5 }` counts every `.face` and every
 * `.dim`, and an attribute selector or `*` counts every element. Erring this
 * way only keeps more art in one live part (compositing), or keeps a variant
 * static that might have played (display).
 */
export interface StyleRules {
  any: boolean;
  classes: Set<string>;
  ids: Set<string>;
  tags: Set<string>;
}

/**
 * The rules of the document's style sheets with a declaration `declares`
 * accepts. Rules inside conditional at-rules (`@media`, `@supports`, …) count
 * as written, and a nested rule counts with the selectors of every rule it
 * sits in, so `.a { & .b { … } }` names both `.a` and `.b`. An `@import`
 * brings rules the bake cannot read, so it counts for every element.
 */
export function styleRules(doc: ArtDocument, declares: (name: string, value: string) => boolean): StyleRules {
  const rules: StyleRules = { any: false, classes: new Set(), ids: new Set(), tags: new Set() };
  const name = (selector: string) => {
    // Each compound selector (`g.dim`, `#eye`, `path`) is matched by any one
    // of its classes or ids, or by its tag when it names nothing else.
    for (const compound of selector.split(/[\s>+~,()]+/)) {
      if (!compound) continue;
      if (/[*[]/.test(compound)) rules.any = true;
      const classes = [...compound.matchAll(/\.(-?[_a-zA-Z][-_a-zA-Z0-9]*)/g)].map((m) => m[1]!);
      const ids = [...compound.matchAll(/#(-?[_a-zA-Z][-_a-zA-Z0-9]*)/g)].map((m) => m[1]!);
      for (const c of classes) rules.classes.add(c);
      for (const id of ids) rules.ids.add(id);
      const tag = /^[a-zA-Z][-a-zA-Z0-9]*/.exec(compound)?.[0];
      if (tag && !classes.length && !ids.length) rules.tags.add(tag.toLowerCase());
    }
  };
  // Declarations made directly in a rule whose selectors are `selectors`.
  const declarations = (text: string, selectors: string[]) => {
    for (const statement of text.split(";")) {
      const trimmed = statement.trim();
      if (/^@import\b/i.test(trimmed)) rules.any = true;
      const colon = trimmed.indexOf(":");
      if (!selectors.length || colon <= 0 || trimmed.startsWith("@")) continue;
      if (declares(trimmed.slice(0, colon).trim().toLowerCase(), trimmed.slice(colon + 1))) selectors.forEach(name);
    }
  };
  // `css` is masked (`maskCss`), so every brace and semicolon is structure.
  const walk = (css: string, selectors: string[]) => {
    let text = "";
    for (let i = 0; i < css.length; i++) {
      const ch = css[i]!;
      if (ch === "{") {
        // The prelude is what follows the last declaration before the block.
        const split = text.lastIndexOf(";");
        declarations(text.slice(0, split + 1), selectors);
        const prelude = text.slice(split + 1).trim();
        let depth = 1;
        let end = i + 1;
        for (; end < css.length && depth; end++) {
          if (css[end] === "{") depth++;
          else if (css[end] === "}") depth--;
        }
        const inner = css.slice(i + 1, depth ? end : end - 1);
        walk(inner, prelude.startsWith("@") ? selectors : [prelude, ...selectors]);
        i = end - 1;
        text = "";
      } else if (ch !== "}") text += ch;
    }
    declarations(text, selectors);
  };
  for (const sheet of subtree(doc.root).filter((e) => e.tagName.toLowerCase() === "style")) {
    walk(maskCss(sheet.children.filter((c): c is string => typeof c === "string").join("")), []);
  }
  return rules;
}

/** The rules that give elements a compositing property. */
export const compositingRules = (doc: ArtDocument): StyleRules => styleRules(doc, compositingValue);

/** The rules that set `display`, which decides whether art draws at all. */
export const displayRules = (doc: ArtDocument): StyleRules => styleRules(doc, (name) => name === "display");

/** Whether one of the rules may apply to the element. */
export const matchesStyleRule = (rules: StyleRules, element: Element): boolean =>
  rules.any ||
  rules.tags.has(element.tagName.toLowerCase()) ||
  (element.attributes["id"] !== undefined && rules.ids.has(element.attributes["id"])) ||
  (element.attributes["class"] ?? "").split(/\s+/).some((c) => c && rules.classes.has(c));

/**
 * Whether the element is authored not to render at all, from the inline
 * `display` declaration that takes effect or else its `display` attribute.
 * Style-sheet `display` rules are not read here: a bake refuses art they
 * could apply to.
 */
export const authoredHidden = (element: Element) =>
  (styleProperty(element, "display") ?? element.attributes["display"])?.trim().toLowerCase() === "none";

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

// The ids `url(#…)` names in CSS text, outside comments and strings.
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
  if (element.tagName.toLowerCase() === "style") {
    ids.push(...cssUrlIds(element.children.filter((c): c is string => typeof c === "string").join("")));
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

// A selector is the text before a `{`, after the last declaration (rules
// nest inside at-rules and other rules); `#abc` in a declaration is a colour.
function rewriteStyleSheet(
  css: string,
  prefix: string,
  known: ReadonlySet<string>,
  rewriteUrls: (text: string) => string,
): string {
  // Structure is read from the masked text, so a brace or `#` in a comment
  // or string is neither a boundary nor a selector; rewrites apply to the
  // original text at the same positions.
  const masked = maskCss(css);
  const rewriteIds = (from: number, to: number) => {
    let text = "";
    let last = from;
    for (const match of masked.slice(from, to).matchAll(/#(-?[_a-zA-Z][-_a-zA-Z0-9]*)/g)) {
      if (!known.has(match[1]!)) continue;
      const at = from + match.index!;
      text += css.slice(last, at) + `#${prefix}${match[1]}`;
      last = at + match[0].length;
    }
    return text + css.slice(last, to);
  };
  let out = "";
  let start = 0;
  for (let i = 0; i < masked.length; i++) {
    if (masked[i] === "{") {
      const split = masked.lastIndexOf(";", i) + 1;
      const prelude = Math.max(start, split);
      out += rewriteUrls(css.slice(start, prelude)) + rewriteIds(prelude, i) + "{";
      start = i + 1;
    } else if (masked[i] === "}") {
      out += rewriteUrls(css.slice(start, i)) + "}";
      start = i + 1;
    }
  }
  return out + rewriteUrls(css.slice(start));
}

export const serialize = (element: Element): string =>
  stringify([element], { quote: "'", selfClosingTags: ["path"] });

/** Attributes that describe one element rather than what it passes down. */
const OWN_ATTRIBUTES = new Set(["id", "transform", "data-name"]);

/**
 * A resource copied out of its place, inside groups that repeat what its
 * original ancestors (below the root, which every part copies) passed down:
 * a `currentColor` stop under `<defs color="lime">` stays lime, and a class
 * rule matching an ancestor still matches. Ids stay with the original, and
 * an ancestor's transform does not apply to a paint server or a clip path.
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
 * Every id a part keeping `keep` depends on: what the kept subtrees and the
 * style sheets reference, transitively, and what the ancestors kept for them
 * reference themselves (a group's `clip-path`).
 */
export function partClosure(doc: ArtDocument, keep: Iterable<Element>, missing?: Set<string>): Set<string> {
  const kept = [...keep];
  // Every part carries every style sheet, so whatever a sheet references
  // (`.skin { fill: url(#skin) }`) is part of every part's closure.
  const sheets = subtree(doc.root).filter((e) => e.tagName.toLowerCase() === "style");
  const closure = resourceClosure(doc, [...kept, ...sheets], missing);
  // Containers kept for their children still carry their own references.
  for (const element of keptAncestry(doc, kept)) {
    for (const id of referencedIds(element)) {
      const target = doc.byId.get(id);
      if (!target) {
        missing?.add(id);
        continue;
      }
      for (const nested of resourceClosure(doc, [target], missing)) closure.add(nested);
      closure.add(id);
    }
  }
  return closure;
}

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
  const sheets = subtree(doc.root).filter((e) => e.tagName.toLowerCase() === "style");
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
