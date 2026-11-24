const SVG_NS = "http://www.w3.org/2000/svg";

const SMIL = ["animate", "animateMotion", "animateTransform", "animateColor", "set"];

const CSS_ANIMATION = /@(?:-[a-z]+-)?keyframes\b|(?:^|[;{\s])(?:-[a-z]+-)?animation(?:-name)?\s*:/i;

export interface SvgLayerSource {
  text: string;
  viewBox: boolean;
}

export type SvgLayerVerdict = { source: SvgLayerSource } | { reason: "animated" | "unsized" | "unread" };

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

const sized = (value: string | null) => !!value && value.trim() !== "" && !value.trim().endsWith("%");

export function readSvgLayer(text: string, parser: DOMParser): SvgLayerVerdict {
  const root = parse(text, parser);
  if (!root) return { reason: "unread" };
  if (SMIL.some((name) => root.getElementsByTagNameNS(SVG_NS, name).length > 0)) return { reason: "animated" };
  const styles = Array.from(root.getElementsByTagNameNS(SVG_NS, "style"), (style) => style.textContent ?? "");
  const inline = Array.from(root.querySelectorAll("[style]"), (element) => element.getAttribute("style") ?? "");
  if ([...styles, ...inline, root.getAttribute("style") ?? ""].some((css) => CSS_ANIMATION.test(css))) return { reason: "animated" };
  const viewBox = root.hasAttribute("viewBox");
  if (!viewBox && !(sized(root.getAttribute("width")) && sized(root.getAttribute("height")))) return { reason: "unsized" };
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
