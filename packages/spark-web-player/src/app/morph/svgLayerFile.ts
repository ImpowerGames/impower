const SVG_NS = "http://www.w3.org/2000/svg";

const SMIL = ["animate", "animateMotion", "animateTransform", "animateColor", "set"];

const CSS_ANIMATION = /(?:^|[;{\s])(?:-[a-z]+-)?animation(?:-name)?\s*:/i;

const MAX_LENGTH = 100000;

const PX_PER_UNIT: Record<string, number> = { "": 1, px: 1, in: 96, cm: 96 / 2.54, mm: 96 / 25.4, q: 96 / 101.6, pt: 96 / 72, pc: 16 };

const NEUTRAL_BOX = ["min-width:0", "min-height:0", "max-width:none", "max-height:none", "margin:0"];

export interface SvgLayerSource {
  text: string;
  viewBox: boolean;
}

export type SvgLayerVerdict = { source: SvgLayerSource } | { reason: "animated" | "unsized" | "unread" | "framed" };

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

const SIDES = ["top", "right", "bottom", "left"];

function framesBox(style: CSSStyleDeclaration | undefined): boolean {
  if (!style) return false;
  return SIDES.some((side) => {
    if (parseFloat(style.getPropertyValue(`padding-${side}`)) > 0) return true;
    const kind = style.getPropertyValue(`border-${side}-style`).trim();
    const width = style.getPropertyValue(`border-${side}-width`).trim();
    return kind !== "" && kind !== "none" && kind !== "hidden" && !(width !== "" && parseFloat(width) === 0);
  });
}

interface CssFacts {
  animated: boolean;
  framed: boolean;
}

function ruleFacts(rules: CSSRuleList | undefined, root: Element, facts: CssFacts) {
  for (const rule of Array.from(rules ?? [])) {
    const style = (rule as CSSStyleRule).style;
    if (namesAnimation(style)) facts.animated = true;
    const selector = (rule as CSSStyleRule).selectorText;
    if (selector !== undefined && framesBox(style)) {
      let matches = true;
      try {
        matches = root.matches(selector);
      } catch {}
      if (matches) facts.framed = true;
    }
    ruleFacts((rule as CSSGroupingRule).cssRules, root, facts);
  }
}

const CSS_BOX = /(?:^|[;{\s])(?:padding|border)(?:-[a-z-]+)?\s*:/i;

function cssFacts(root: Element, sheets: string[], declarations: string[], view: (Window & typeof globalThis) | null | undefined): CssFacts {
  const own = root.getAttribute("style") ?? "";
  const Sheet = view?.CSSStyleSheet;
  if (view && Sheet && typeof Sheet.prototype.replaceSync === "function") {
    const facts: CssFacts = { animated: false, framed: false };
    for (const text of sheets) {
      const sheet = new Sheet();
      try {
        sheet.replaceSync(text);
      } catch {
        return { animated: true, framed: true };
      }
      ruleFacts(sheet.cssRules, root, facts);
    }
    const probe = view.document.createElement("div");
    for (const text of declarations) {
      probe.setAttribute("style", text);
      if (namesAnimation(probe.style)) facts.animated = true;
    }
    probe.setAttribute("style", own);
    if (framesBox(probe.style)) facts.framed = true;
    return facts;
  }
  const plain = [...sheets, ...declarations].map(cssWithoutComments);
  return {
    animated: plain.some((css) => CSS_ANIMATION.test(css)),
    framed: [...sheets, own].map(cssWithoutComments).some((css) => CSS_BOX.test(css)),
  };
}

export function readSvgLayer(
  text: string,
  parser: DOMParser,
  options: { view?: (Window & typeof globalThis) | null; natural?: { width: number; height: number } } = {},
): SvgLayerVerdict {
  const root = parse(text, parser);
  if (!root) return { reason: "unread" };
  if (SMIL.some((name) => root.getElementsByTagNameNS(SVG_NS, name).length > 0)) return { reason: "animated" };
  const sheets = Array.from(root.getElementsByTagNameNS(SVG_NS, "style"), (style) => style.textContent ?? "");
  const declarations = Array.from(root.querySelectorAll("[style]"), (element) => element.getAttribute("style") ?? "");
  if (root.hasAttribute("style")) declarations.push(root.getAttribute("style")!);
  const facts = cssFacts(root, sheets, declarations, options.view);
  if (facts.animated) return { reason: "animated" };
  if (facts.framed) return { reason: "framed" };
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
  const style = (root.getAttribute("style") ?? "").trim();
  const forced = [`width:${width}px`, `height:${height}px`, ...NEUTRAL_BOX].map((declaration) => `${declaration} !important`).join(";");
  root.setAttribute("style", `${style}${style && !style.endsWith(";") ? ";" : ""}${forced}`);
  return serializer.serializeToString(root.ownerDocument);
}

export const browserSvgLayerRasterizer: SvgLayerRasterizer = async (source, natural, width, height, doc) => {
  const view = doc.defaultView as (Window & typeof globalThis) | null;
  if (!view?.DOMParser || !view.XMLSerializer || !view.Image) return undefined;
  const text = fittedSvgLayer(source, natural, width, height, new view.DOMParser(), new view.XMLSerializer());
  if (!text) return undefined;
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
