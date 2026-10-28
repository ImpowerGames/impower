// The solid paint a drawing is drawn with, resolved as a browser would from
// the artwork's attributes and inline styles, and the record a `morph`
// transition keeps of the paint its two drawings differ in. Artwork with a
// style sheet is never baked live, so no sheet rule takes part.

import { cssTrim, readAlpha, readColor, type ReadColor } from "./color";
import { ancestry, maskCss, type ArtDocument, type Element } from "./svgDocument";
import type { MorphColor, MorphPaint } from "./types";

/**
 * A drawing's effective paint. A fill or stroke is a colour or `none`; an
 * undefined value is one the colour reader cannot read (a paint server among
 * them), which does not blend.
 */
export interface EffectivePaint {
  fill: MorphColor | "none" | undefined;
  stroke: MorphColor | "none" | undefined;
  "fill-opacity": number | undefined;
  "stroke-opacity": number | undefined;
  opacity: number | undefined;
}

/** The inherited properties and their SVG initial values. */
const INHERITED = { fill: "black", stroke: "none", "fill-opacity": "1", "stroke-opacity": "1", color: "black" };
type Inherited = keyof typeof INHERITED;

/** The keywords every property, and the `all` shorthand, accepts. */
const CSS_WIDE = new Set(["initial", "inherit", "unset", "revert", "revert-layer"]);

const IMPORTANT = /![ \t\n\r\f]*important$/i;

/**
 * An element's inline style declarations in order: names lowercased, values
 * with comments blanked and strings masked, and both trimmed of CSS
 * whitespace only, so a no-break space stays part of the value it makes
 * invalid.
 */
function inlineDeclarations(element: Element): { name: string; value: string; important: boolean }[] {
  const masked = maskCss(element.attributes["style"] ?? "");
  const out: { name: string; value: string; important: boolean }[] = [];
  let start = 0;
  for (let end = 0; end <= masked.length; end++) {
    if (end < masked.length && masked[end] !== ";") continue;
    const colon = masked.indexOf(":", start);
    if (colon >= 0 && colon < end) {
      const name = cssTrim(masked.slice(start, colon)).toLowerCase();
      const value = cssTrim(masked.slice(colon + 1, end));
      const important = IMPORTANT.test(value);
      if (name) out.push({ name, value: important ? cssTrim(value.replace(IMPORTANT, "")) : value, important });
    }
    start = end + 1;
  }
  return out;
}

/**
 * Whether a browser drops this declaration as invalid, so that the next one
 * in the cascade applies: `none` is paint, not a colour, and `all` takes
 * nothing but the CSS-wide keywords.
 */
const dropped = (name: string, value: string) =>
  name === "all" ? !CSS_WIDE.has(value.toLowerCase()) : name === "color" && value.toLowerCase() === "none";

/**
 * What an element declares for `name`, as the cascade picks it once invalid
 * declarations are dropped: its inline style (the last important declaration,
 * else the last, an `all` declaration counting for every property), which
 * outranks the presentation attribute.
 */
const declared = (element: Element, name: string): string | undefined => {
  const inline = inlineDeclarations(element).filter((d) => (d.name === name || d.name === "all") && !dropped(d.name, d.value));
  const chosen = inline.findLast((d) => d.important) ?? inline[inline.length - 1];
  if (chosen) return chosen.value;
  const attribute = element.attributes[name];
  return attribute === undefined || dropped(name, cssTrim(attribute)) ? undefined : cssTrim(attribute);
};

/** Resolves `element`'s effective paint, its ancestors' inherited values included. */
export function effectivePaint(doc: ArtDocument, element: Element): EffectivePaint {
  const values: Record<Inherited, string> = { ...INHERITED };
  for (const { element: e } of [...ancestry(doc, element)].reverse()) {
    for (const name of Object.keys(INHERITED) as Inherited[]) {
      const value = declared(e, name);
      if (value === undefined) continue;
      const keyword = value.toLowerCase();
      if (keyword === "inherit" || keyword === "unset") continue;
      // `revert` and `revert-layer` stay as written, which no reader reads,
      // so that paint does not blend.
      // `color: currentColor` is the inherited colour.
      if (name === "color" && keyword === "currentcolor") continue;
      values[name] = keyword === "initial" ? INHERITED[name] : value;
    }
  }
  const color = readColor(values.color);
  const paint = (value: string): EffectivePaint["fill"] => {
    const read: ReadColor | undefined = readColor(value);
    const resolved = read?.kind === "current" ? (color?.kind === "color" ? color : undefined) : read;
    if (!resolved) return undefined;
    return resolved.kind === "none" ? "none" : resolved.color;
  };
  // `opacity` does not inherit unless it says so.
  let opacity = "1";
  for (const { element: e } of ancestry(doc, element)) {
    const value = declared(e, "opacity");
    const keyword = value?.toLowerCase();
    if (keyword === "inherit") continue;
    if (value !== undefined && keyword !== "initial" && keyword !== "unset") opacity = value;
    break;
  }
  return {
    fill: paint(values.fill),
    stroke: paint(values.stroke),
    "fill-opacity": readAlpha(values["fill-opacity"]),
    "stroke-opacity": readAlpha(values["stroke-opacity"]),
    opacity: readAlpha(opacity),
  };
}

const sameColor = (a: MorphColor | "none" | undefined, b: MorphColor | "none" | undefined) =>
  a === b || (Array.isArray(a) && Array.isArray(b) && a.every((v, i) => v === b[i]));

/**
 * The paint record of a `morph` transition from `from` to `to` drawn on a
 * node copied from `home`: each property `home` would not already show at
 * both ends, with both ends' values. Undefined when there is none.
 */
export function paintBlend(from: EffectivePaint, to: EffectivePaint, home: EffectivePaint): MorphPaint | undefined {
  const out: MorphPaint = {};
  const differs = <T>(name: keyof EffectivePaint, same: (a: T, b: T) => boolean) =>
    !same(from[name] as T, to[name] as T) || !same(from[name] as T, home[name] as T);
  for (const name of ["fill", "stroke"] as const) {
    const a = from[name];
    const b = to[name];
    // A paint either end cannot read keeps the paint of the node it draws on.
    if (a === undefined || b === undefined) continue;
    const opacity = `${name}-opacity` as const;
    if (differs(name, sameColor)) {
      // `none` is the other end's colour at zero alpha.
      const clear = (other: MorphColor | "none"): MorphColor => (other === "none" ? [0, 0, 0, 0] : [other[0], other[1], other[2], 0]);
      out[name] = [a === "none" ? clear(b) : a, b === "none" ? clear(a) : b];
    }
    const oa = from[opacity];
    const ob = to[opacity];
    if (oa !== undefined && ob !== undefined && differs<number | undefined>(opacity, (x, y) => x === y)) out[opacity] = [oa, ob];
  }
  if (from.opacity !== undefined && to.opacity !== undefined && differs<number | undefined>("opacity", (x, y) => x === y)) {
    out.opacity = [from.opacity, to.opacity];
  }
  return Object.keys(out).length ? out : undefined;
}
