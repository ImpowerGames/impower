const SVG_NS = "http://www.w3.org/2000/svg";

const SMIL = ["animate", "animateMotion", "animateTransform", "animateColor", "set"];

const CSS_ANIMATION = /(?:^|[;{\s])(?:-[a-z]+-)?animation(?:-name)?\s*:/i;

const MAX_LENGTH = 100000;

const PX_PER_UNIT: Record<string, number> = { "": 1, px: 1, in: 96, cm: 96 / 2.54, mm: 96 / 25.4, q: 96 / 101.6, pt: 96 / 72, pc: 16 };

export const ROOT_PROPERTIES: readonly string[] = [
  "width",
  "height",
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-opacity",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-dasharray",
  "stroke-dashoffset",
  "opacity",
  "color",
  "clip-rule",
  "paint-order",
  "shape-rendering",
  "text-rendering",
  "image-rendering",
  "color-interpolation",
  "color-interpolation-filters",
  "stop-color",
  "stop-opacity",
  "flood-color",
  "flood-opacity",
  "lighting-color",
];

export interface SvgLayerSource {
  text: string;
  viewBox: boolean;
}

export type SvgLayerVerdict = { source: SvgLayerSource } | { reason: "animated" | "unsized" | "unread" } | { reason: "styled"; declaration: string };

export interface SvgLayerRaster {
  image: CanvasImageSource;
  release(): void;
}

export type SvgLayerRasterizer = (
  source: SvgLayerSource,
  natural: { width: number; height: number },
  width: number,
  height: number,
  doc: Document,
) => Promise<SvgLayerRaster | undefined>;

export function looksLikeSvg(bytes: Uint8Array): boolean {
  let at = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  while (at < bytes.length && (bytes[at] === 0x20 || bytes[at] === 0x09 || bytes[at] === 0x0a || bytes[at] === 0x0d)) at += 1;
  return bytes[at] === 0x3c;
}

function parse(text: string, parser: DOMParser): SVGSVGElement | undefined {
  let doc: Document;
  try {
    doc = parser.parseFromString(text, "image/svg+xml");
  } catch {
    return undefined;
  }
  const root = doc.documentElement;
  if (!root || root.localName !== "svg" || root.namespaceURI !== SVG_NS) return undefined;
  if (doc.getElementsByTagName("parsererror").length > 0) return undefined;
  return root as unknown as SVGSVGElement;
}

const ABSOLUTE_LENGTH = /^\s*\+?((?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(px|in|cm|mm|q|pt|pc|em|ex|rem)?\s*$/i;

function length(value: string | null): { amount: number; px?: number } | undefined {
  const match = value === null ? null : ABSOLUTE_LENGTH.exec(value);
  if (!match) return undefined;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_LENGTH) return undefined;
  const unit = (match[2] ?? "").toLowerCase();
  const scale = PX_PER_UNIT[unit];
  return scale === undefined ? { amount } : { amount, px: amount * scale };
}

export function cssWithoutComments(css: string): string {
  let out = "";
  let at = 0;
  while (at < css.length) {
    const char = css[at]!;
    if (char === "\\") {
      out += css.slice(at, at + 2);
      at += 2;
    } else if (char === '"' || char === "'") {
      let end = at + 1;
      while (end < css.length && css[end] !== char && css[end] !== "\n") end += css[end] === "\\" ? 2 : 1;
      out += css.slice(at, end + 1);
      at = end + 1;
    } else if (/^url\(\s*[^\s"')]/i.test(css.slice(at, at + 64)) && !/[\w-]/.test(css[at - 1] ?? "")) {
      let end = css.indexOf("(", at) + 1;
      while (end < css.length && css[end] !== ")") end += css[end] === "\\" ? 2 : 1;
      out += css.slice(at, end + 1);
      at = end + 1;
    } else if (char === "/" && css[at + 1] === "*") {
      const close = css.indexOf("*/", at + 2);
      out += " ";
      at = close < 0 ? css.length : close + 2;
    } else {
      out += char;
      at += 1;
    }
  }
  return out;
}

function namesAnimation(style: CSSStyleDeclaration | undefined): boolean {
  const names = style?.getPropertyValue("animation-name") ?? "";
  return names.split(",").some((name) => name.trim() !== "" && name.trim() !== "none");
}

type View = (Window & typeof globalThis) | null | undefined;

function sheetRules(text: string, view: View): CSSRuleList | undefined {
  const Sheet = view?.CSSStyleSheet;
  if (Sheet && typeof Sheet.prototype.replaceSync === "function") {
    const sheet = new Sheet();
    sheet.replaceSync(text);
    return sheet.cssRules;
  }
  const inert = view?.document.implementation.createHTMLDocument("");
  if (!inert) return undefined;
  const style = inert.createElement("style");
  style.textContent = text;
  inert.head.appendChild(style);
  return style.sheet?.cssRules ?? undefined;
}

function propertiesOf(style: CSSStyleDeclaration | undefined): string[] {
  if (!style) return [];
  return Array.from({ length: style.length }, (_, index) => style.item(index).toLowerCase());
}

interface CssFacts {
  animated: boolean;
  rootProperties: string[];
  unreadable?: string;
}

function nestedSelector(selector: string, parent: string | undefined): string {
  if (parent === undefined) return selector;
  return selector.includes("&") ? selector.split("&").join(`:is(${parent})`) : `:is(${parent}) ${selector}`;
}

function ruleFacts(rules: CSSRuleList | undefined, root: Element, facts: CssFacts, parent?: string) {
  for (const rule of Array.from(rules ?? [])) {
    if ((rule as CSSImportRule).href !== undefined && (rule as CSSImportRule).styleSheet !== undefined) facts.unreadable = "a style sheet the player cannot read";
    const style = (rule as CSSStyleRule).style;
    if (namesAnimation(style)) facts.animated = true;
    const own = (rule as CSSStyleRule).selectorText;
    const selector = own !== undefined ? nestedSelector(own, parent) : parent;
    if (style && selector !== undefined) {
      let matches = true;
      try {
        matches = root.matches(selector);
      } catch {}
      if (matches) facts.rootProperties.push(...propertiesOf(style));
    }
    ruleFacts((rule as CSSGroupingRule).cssRules, root, facts, selector);
  }
}

function cssFacts(root: Element, sheets: string[], declarations: string[], view: View): CssFacts {
  const facts: CssFacts = { animated: false, rootProperties: [] };
  for (const text of sheets) {
    let rules: CSSRuleList | undefined;
    try {
      rules = sheetRules(text, view);
    } catch {
      rules = undefined;
    }
    if (rules === undefined) {
      facts.unreadable = "a style sheet the player cannot read";
      if (CSS_ANIMATION.test(cssWithoutComments(text))) facts.animated = true;
    } else ruleFacts(rules, root, facts);
  }
  const probe = view?.document.createElement("div");
  const parsed = typeof view?.CSSStyleSheet?.prototype.replaceSync === "function";
  for (const text of declarations) {
    if (probe) {
      probe.setAttribute("style", text);
      if (namesAnimation(probe.style)) facts.animated = true;
    }
    if (!parsed && CSS_ANIMATION.test(cssWithoutComments(text))) facts.animated = true;
  }
  if (root.hasAttribute("style")) {
    if (probe) {
      probe.setAttribute("style", root.getAttribute("style")!);
      facts.rootProperties.push(...propertiesOf(probe.style));
    } else facts.unreadable = "a style attribute the player cannot read";
  }
  return facts;
}

export function readSvgLayer(
  text: string,
  parser: DOMParser,
  options: { view?: View; natural?: { width: number; height: number } } = {},
): SvgLayerVerdict {
  const root = parse(text, parser);
  if (!root) return { reason: "unread" };
  if (SMIL.some((name) => root.getElementsByTagNameNS(SVG_NS, name).length > 0)) return { reason: "animated" };
  const elements = Array.from(root.getElementsByTagName("*"));
  const sheets = elements.filter((element) => element.localName === "style").map((style) => style.textContent ?? "");
  const linked = elements.some((element) => element.localName === "link") || Array.from(root.ownerDocument.childNodes).some((node) => node.nodeType === 7 && node.nodeName === "xml-stylesheet");
  const declarations = Array.from(root.querySelectorAll("[style]"), (element) => element.getAttribute("style") ?? "");
  if (root.hasAttribute("style")) declarations.push(root.getAttribute("style")!);
  const facts = cssFacts(root, sheets, declarations, options.view);
  if (facts.animated) return { reason: "animated" };
  if (linked) return { reason: "styled", declaration: "a style sheet the player cannot read" };
  if (facts.unreadable !== undefined) return { reason: "styled", declaration: facts.unreadable };
  const refused = facts.rootProperties.find((property) => !ROOT_PROPERTIES.includes(property));
  if (refused !== undefined) return { reason: "styled", declaration: refused };
  const viewBox = root.hasAttribute("viewBox");
  if (!viewBox) {
    const width = length(root.getAttribute("width"));
    const height = length(root.getAttribute("height"));
    if (!width || !height) return { reason: "unsized" };
    const natural = options.natural;
    const off = (expected: number | undefined, actual: number | undefined) => expected !== undefined && actual !== undefined && Math.abs(expected - actual) > 1;
    if (natural && (!(natural.width > 0 && natural.height > 0) || off(width.px, natural.width) || off(height.px, natural.height))) return { reason: "unsized" };
  }
  return { source: { text, viewBox } };
}

export function fittedSvgLayer(
  source: SvgLayerSource,
  natural: { width: number; height: number },
  width: number,
  height: number,
  parser: DOMParser,
  serializer: XMLSerializer,
): string | undefined {
  const root = parse(source.text, parser);
  if (!root) return undefined;
  if (!root.hasAttribute("viewBox")) {
    root.setAttribute("viewBox", `0 0 ${natural.width} ${natural.height}`);
    root.setAttribute("preserveAspectRatio", "none");
  }
  root.setAttribute("width", String(width));
  root.setAttribute("height", String(height));
  const style = (root as unknown as ElementCSSInlineStyle).style;
  if (!style) return undefined;
  style.setProperty("width", `${width}px`, "important");
  style.setProperty("height", `${height}px`, "important");
  return serializer.serializeToString(root.ownerDocument);
}

export const browserSvgLayerRasterizer: SvgLayerRasterizer = async (source, natural, width, height, doc) => {
  const view = doc.defaultView as (Window & typeof globalThis) | null;
  if (!view?.DOMParser || !view.XMLSerializer || !view.Image) return undefined;
  const text = fittedSvgLayer(source, natural, width, height, new view.DOMParser(), new view.XMLSerializer());
  if (!text || !("source" in readSvgLayer(text, new view.DOMParser(), { view }))) return undefined;
  const img = new view.Image();
  img.decoding = "async";
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;
  try {
    await img.decode();
  } catch {
    if (!img.complete || !(img.naturalWidth > 0 && img.naturalHeight > 0)) return undefined;
  }
  const canvas = doc.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return undefined;
  try {
    context.drawImage(img, 0, 0, width, height);
  } catch {
    return undefined;
  }
  return {
    image: canvas,
    release: () => {
      canvas.width = 0;
      canvas.height = 0;
    },
  };
};
