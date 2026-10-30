import { parseTransform, type Affine } from "./affine";
import { own } from "./own";
import { stopColor } from "./paint";
import { gradientAttributes } from "./render";
import { ancestry, inlineDeclarations, type ArtDocument, type Element } from "./svgDocument";
import type { MorphGradient } from "./types";

const KINDS: Record<string, MorphGradient["kind"]> = { linearGradient: "linear", radialGradient: "radial" };
const UNITS = new Set<string>(["userSpaceOnUse", "objectBoundingBox"]);
const SPREADS = new Set<string>(["pad", "reflect", "repeat"]);

const GEOMETRY: Record<MorphGradient["kind"], [string, string | undefined][]> = {
  linear: [["x1", "0%"], ["y1", "0%"], ["x2", "100%"], ["y2", "0%"]],
  radial: [["cx", "50%"], ["cy", "50%"], ["r", "50%"], ["fx", undefined], ["fy", undefined], ["fr", "0%"]],
};

const NUMBER = /^[-+]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][-+]?\d+)?$/;
const WSP = /^[ \t\n\r]+|[ \t\n\r]+$/g;
const REFERENCE = /^#([A-Za-z0-9_.-]+)$/;

const elementsOf = (element: Element): Element[] =>
  element.children.filter((c): c is Element => !!c && typeof c === "object");

const GRADIENT_LIMIT = 1e300;

export const gradientNumbers = (numbers: readonly number[]) => numbers.every((n) => Math.abs(n) <= GRADIENT_LIMIT);

const fraction = (text: string): { value: number; percent: boolean } | undefined => {
  const percent = text.endsWith("%");
  const body = percent ? text.slice(0, -1) : text;
  if (!NUMBER.test(body)) return undefined;
  const value = percent ? Number(body) / 100 : Number(body);
  return gradientNumbers([value]) ? { value, percent } : undefined;
};

export function readGradientTransform(text: string): Affine | undefined {
  const matrix = parseTransform(text);
  return matrix && gradientNumbers(matrix) ? matrix : undefined;
}

const interpolates = (doc: ArtDocument, element: Element) =>
  [...ancestry(doc, element)].some(({ element: e }) => {
    if (e.attributes["color-interpolation"] !== undefined) return true;
    const inline = inlineDeclarations(e);
    return inline === null || inline.some((d) => d.name === "color-interpolation" || d.name === "all");
  });

const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";

const boundNamespace = (doc: ArtDocument, element: Element, name: string): string | undefined => {
  for (const { element: e } of ancestry(doc, element)) {
    const declared = e.attributes[name];
    if (declared !== undefined) return declared;
  }
  return undefined;
};

const inSvg = (doc: ArtDocument, element: Element) => boundNamespace(doc, element, "xmlns") === SVG_NS;

export function readGradient(doc: ArtDocument, id: string): MorphGradient | undefined {
  const chain: Element[] = [];
  for (let at = doc.byId.get(id); at; ) {
    if (chain.includes(at) || !own(KINDS, at.tagName) || !inSvg(doc, at)) return undefined;
    if ((at.attributes["style"] ?? "").replace(WSP, "") || at.attributes["transform"] !== undefined) return undefined;
    if (Object.keys(at.attributes).some((name) => name.endsWith(":href") && name !== "xlink:href")) return undefined;
    if (at.attributes["xlink:href"] !== undefined && boundNamespace(doc, at, "xmlns:xlink") !== XLINK_NS) return undefined;
    if (elementsOf(at).some((child) => child.tagName !== "stop" || elementsOf(child).length > 0)) return undefined;
    if (interpolates(doc, at)) return undefined;
    chain.push(at);
    const href = at.attributes["href"] ?? at.attributes["xlink:href"];
    if (href === undefined) break;
    const target = REFERENCE.exec(href)?.[1];
    if (target === undefined || !doc.byId.has(target)) return undefined;
    at = doc.byId.get(target);
  }
  const head = chain[0];
  if (!head) return undefined;
  const kind = KINDS[head.tagName]!;
  const attribute = (name: string, sameKind = false) =>
    chain.find((e) => (!sameKind || KINDS[e.tagName] === kind) && e.attributes[name] !== undefined)?.attributes[name];
  const units = attribute("gradientUnits") ?? "objectBoundingBox";
  const spread = attribute("spreadMethod") ?? "pad";
  if (!UNITS.has(units) || !SPREADS.has(spread)) return undefined;
  const transform = readGradientTransform(attribute("gradientTransform") ?? "");
  if (!transform) return undefined;
  const geometry: number[] = [];
  for (const [name, initial] of GEOMETRY[kind]) {
    const text = attribute(name, true) ?? initial;
    if (text === undefined) {
      geometry.push(geometry[name === "fx" ? 0 : 1]!);
      continue;
    }
    const read = fraction(text);
    if (!read || (read.percent && units === "userSpaceOnUse" && read.value !== 0)) return undefined;
    geometry.push(read.value);
  }
  if (kind === "radial" && (geometry[2]! < 0 || geometry[5]! < 0)) return undefined;
  const holder = chain.find((e) => elementsOf(e).length > 0);
  if (!holder) return undefined;
  const stops: [number, MorphGradient["stops"][number][1]][] = [];
  let last = 0;
  for (const stop of elementsOf(holder)) {
    const text = stop.attributes["offset"] ?? "0";
    const read = fraction(text);
    const color = stopColor(doc, stop);
    if (!read || !color || interpolates(doc, stop) || !inSvg(doc, stop)) return undefined;
    last = Math.max(last, Math.min(1, Math.max(0, read.value)));
    stops.push([last, color]);
  }
  return {
    kind,
    units: units as MorphGradient["units"],
    spread: spread as MorphGradient["spread"],
    geometry,
    transform: [...transform],
    stops,
  };
}

export const gradientsMatch = (a: MorphGradient, b: MorphGradient) =>
  a.kind === b.kind && a.units === b.units && a.spread === b.spread && a.stops.length === b.stops.length;

export function gradientCopy(id: string, gradient: MorphGradient): Element {
  const { attributes, stops } = gradientAttributes(gradient);
  return {
    tagName: gradient.kind === "linear" ? "linearGradient" : "radialGradient",
    attributes: { id, gradientUnits: gradient.units, spreadMethod: gradient.spread, ...attributes },
    children: stops.map((stop) => ({ tagName: "stop", attributes: { ...stop }, children: [] })),
  };
}
