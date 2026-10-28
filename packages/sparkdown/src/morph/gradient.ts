// The gradients a moving drawing's fill or stroke paints with, read from the
// artwork within a closed grammar, and the copy of one a live part carries
// for the moving shape to paint with. Artwork with a style sheet is never
// baked live, so no sheet rule takes part.
//
// A gradient blends only when everything that decides it is in this grammar:
// a `linearGradient` or `radialGradient` with no inline `style` and no
// `transform` attribute, holding nothing but `stop` elements, reached from
// the drawing through a bare `url(#id)` and from there through `href` or
// `xlink:href` of the form `#id`, each to another such gradient; its
// `gradientUnits` and `spreadMethod` spelled exactly as SVG names them;
// coordinates as plain numbers or percentages, with nothing around them,
// a percentage in `userSpaceOnUse` only at zero (any other resolves against
// a viewport); a `gradientTransform` as a list of the six transform
// functions, numbers separated by commas or spaces and functions by a comma
// or spaces; each stop's `offset` the same way, and its colour as `paint.ts`
// reads `stop-color` and `stop-opacity`; and no `color-interpolation` on the
// gradients, their stops or their ancestors. Anything else leaves the pair
// unblended. Reading less than a browser does is safe; reading something
// differently is not.

import { IDENTITY, parseTransform, type Affine } from "./affine";
import { own } from "./own";
import { stopColor } from "./paint";
import { gradientAttributes } from "./render";
import { ancestry, styleDeclarations, type ArtDocument, type Element } from "./svgDocument";
import type { MorphGradient } from "./types";

const KINDS: Record<string, MorphGradient["kind"]> = { linearGradient: "linear", radialGradient: "radial" };
const UNITS = new Set<string>(["userSpaceOnUse", "objectBoundingBox"]);
const SPREADS = new Set<string>(["pad", "reflect", "repeat"]);

/** Each kind's coordinates in `MorphGradient.geometry` order, with their initial values. */
const GEOMETRY: Record<MorphGradient["kind"], [string, string | undefined][]> = {
  linear: [["x1", "0%"], ["y1", "0%"], ["x2", "100%"], ["y2", "0%"]],
  // An unset focus is the centre.
  radial: [["cx", "50%"], ["cy", "50%"], ["r", "50%"], ["fx", undefined], ["fy", undefined], ["fr", "0%"]],
};

const NUMBER = /^[-+]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][-+]?\d+)?$/;
const WSP = /^[ \t\n\r]+|[ \t\n\r]+$/g;
const TRANSFORMS = new Set(["matrix", "translate", "scale", "rotate", "skewX", "skewY"]);
const REFERENCE = /^#([A-Za-z0-9_.-]+)$/;

const elementsOf = (element: Element): Element[] =>
  element.children.filter((c): c is Element => !!c && typeof c === "object");

/** A number, or a percentage as a fraction; undefined otherwise. */
const fraction = (text: string): { value: number; percent: boolean } | undefined => {
  const percent = text.endsWith("%");
  const body = percent ? text.slice(0, -1) : text;
  return NUMBER.test(body) ? { value: percent ? Number(body) / 100 : Number(body), percent } : undefined;
};

/** A `gradientTransform` in the grammar, or undefined. */
export function readGradientTransform(text: string): Affine | undefined {
  let rest = text.replace(WSP, "");
  if (!rest) return IDENTITY;
  let first = true;
  while (rest) {
    if (!first) {
      const separator = /^(?:[ \t\n\r]*,[ \t\n\r]*|[ \t\n\r]+)/.exec(rest);
      if (!separator) return undefined;
      rest = rest.slice(separator[0].length);
    }
    first = false;
    const call = /^([A-Za-z]+)[ \t\n\r]*\(([^()]*)\)/.exec(rest);
    if (!call || !TRANSFORMS.has(call[1]!)) return undefined;
    const args = call[2]!.replace(WSP, "");
    if (!args || !args.split(/[ \t\n\r]*,[ \t\n\r]*|[ \t\n\r]+/).every((arg) => NUMBER.test(arg))) return undefined;
    rest = rest.slice(call[0].length);
  }
  // Validated, so the lenient parser reads exactly these numbers.
  return parseTransform(text) ?? undefined;
}

/** Whether the element or an ancestor sets `color-interpolation`, which the bake does not read. */
const interpolates = (doc: ArtDocument, element: Element) =>
  [...ancestry(doc, element)].some(
    ({ element: e }) => e.attributes["color-interpolation"] !== undefined || styleDeclarations(e).some(([name]) => name === "color-interpolation"),
  );

/**
 * The gradient `id` names, resolved through its `href` chain: each attribute
 * from the first gradient in the chain that sets it (coordinates only from
 * gradients of the first one's kind) and the stops of the first that has
 * any. Undefined for anything outside the grammar, a chain that loops or
 * reaches something other than a gradient, or no stops.
 */
export function readGradient(doc: ArtDocument, id: string): MorphGradient | undefined {
  const chain: Element[] = [];
  for (let at = doc.byId.get(id); at; ) {
    if (chain.includes(at) || !own(KINDS, at.tagName)) return undefined;
    // Inline style could set the transform, and a `transform` attribute is
    // one in SVG 2; a link in any other namespace prefix is one the bake
    // cannot tell from `xlink:href`.
    if ((at.attributes["style"] ?? "").replace(WSP, "") || at.attributes["transform"] !== undefined) return undefined;
    if (Object.keys(at.attributes).some((name) => name.endsWith(":href") && name !== "xlink:href")) return undefined;
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
      // `fx` and `fy` default to the centre.
      geometry.push(geometry[name === "fx" ? 0 : 1]!);
      continue;
    }
    const read = fraction(text);
    // A user-space percentage resolves against a viewport; zero is zero anywhere.
    if (!read || (read.percent && units === "userSpaceOnUse" && read.value !== 0)) return undefined;
    geometry.push(read.value);
  }
  // A negative radius is an error a browser does not draw.
  if (kind === "radial" && (geometry[2]! < 0 || geometry[5]! < 0)) return undefined;
  const holder = chain.find((e) => elementsOf(e).length > 0);
  if (!holder) return undefined;
  const stops: [number, MorphGradient["stops"][number][1]][] = [];
  let last = 0;
  for (const stop of elementsOf(holder)) {
    const text = stop.attributes["offset"] ?? "0";
    const read = fraction(text);
    const color = stopColor(doc, stop);
    if (!read || !color || interpolates(doc, stop)) return undefined;
    // Offsets clamp to 0..1, and one below an earlier stop's takes that one's.
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

/** Whether two gradients can blend: the same kind, units, spread and stop count. */
export const gradientsMatch = (a: MorphGradient, b: MorphGradient) =>
  a.kind === b.kind && a.units === b.units && a.spread === b.spread && a.stops.length === b.stops.length;

/** The copy of a gradient a live part carries, written with `gradient`'s values. */
export function gradientCopy(id: string, gradient: MorphGradient): Element {
  const { attributes, stops } = gradientAttributes(gradient);
  return {
    tagName: gradient.kind === "linear" ? "linearGradient" : "radialGradient",
    attributes: { id, gradientUnits: gradient.units, spreadMethod: gradient.spread, ...attributes },
    children: stops.map((stop) => ({ tagName: "stop", attributes: { ...stop }, children: [] })),
  };
}
