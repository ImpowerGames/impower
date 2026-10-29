// The solid paint a drawing is drawn with, read from the artwork's attributes
// and inline styles within a closed grammar, and the record a `morph`
// transition keeps of the paint its two drawings differ in. Artwork with a
// style sheet, or an inline style the bake cannot read safely, is never
// baked live, so no sheet rule takes part.

import { cssTrim, readAlpha, readColor, type ReadColor } from "./color";
import { ancestry, inlineDeclarations, type ArtDocument, type Element } from "./svgDocument";
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

// The paint grammar. A paint blends only when every declaration that decides
// it is in this grammar: a fill or stroke as a colour the reader reads, or
// `none`; `color` as a colour or `currentColor`; an opacity as a number or a
// percentage; any of them as `inherit` or `initial`; each with an optional
// trailing `!important`, in the inline style grammar `svgDocument.ts` reads
// (ASCII with space, tab and line breaks between tokens). A declaration
// outside it (another CSS-wide keyword, `all`, `var()`,
// a comment, an escape, other whitespace, non-ASCII text) makes that paint
// unknown, so the pair stays unblended and draws as authored. Reading less
// than a browser does is safe; reading something differently is not.

const KEYWORDS = new Set(["inherit", "initial"]);

const inGrammar = (name: string, value: string): boolean => {
  if (KEYWORDS.has(value.toLowerCase())) return true;
  if (name === "fill" || name === "stroke") return readColor(value) !== undefined;
  if (name === "color") return ["color", "current"].includes(readColor(value)?.kind ?? "");
  return readAlpha(value) !== undefined;
};

/**
 * What an element declares for `name`: its inline style (the last important
 * declaration, else the last), which outranks the presentation attribute;
 * undefined when it declares nothing, and null when any declaration that
 * could decide it is outside the grammar.
 */
const declared = (element: Element, name: string): string | undefined | null => {
  const inline = inlineDeclarations(element);
  if (inline === null) return null;
  const own = inline.filter((d) => d.name === name || d.name === "all");
  if (own.some((d) => d.name === "all" || !inGrammar(name, d.value))) return null;
  const attribute = element.attributes[name];
  if (attribute !== undefined && !inGrammar(name, cssTrim(attribute))) return null;
  const chosen = own.findLast((d) => d.important) ?? own[own.length - 1];
  return chosen ? chosen.value : attribute === undefined ? undefined : cssTrim(attribute);
};

/** Resolves `element`'s effective paint, its ancestors' inherited values included. */
export function effectivePaint(doc: ArtDocument, element: Element): EffectivePaint {
  // Null marks a value outside the grammar until a later declaration replaces it.
  const values: Record<Inherited, string | null> = { ...INHERITED };
  for (const { element: e } of [...ancestry(doc, element)].reverse()) {
    for (const name of Object.keys(INHERITED) as Inherited[]) {
      const value = declared(e, name);
      if (value === undefined) continue;
      if (value === null) {
        values[name] = null;
        continue;
      }
      const keyword = value.toLowerCase();
      if (keyword === "inherit") continue;
      // `color: currentColor` is the inherited colour.
      if (name === "color" && keyword === "currentcolor") continue;
      values[name] = keyword === "initial" ? INHERITED[name] : value;
    }
  }
  const color = values.color === null ? undefined : readColor(values.color);
  const paint = (value: string | null): EffectivePaint["fill"] => {
    const read: ReadColor | undefined = value === null ? undefined : readColor(value);
    const resolved = read?.kind === "current" ? (color?.kind === "color" ? color : undefined) : read;
    if (!resolved) return undefined;
    return resolved.kind === "none" ? "none" : resolved.color;
  };
  const alpha = (value: string | null) => (value === null ? undefined : readAlpha(value));
  // `opacity` does not inherit unless it says so.
  let opacity: string | null = "1";
  for (const { element: e } of ancestry(doc, element)) {
    const value = declared(e, "opacity");
    if (value?.toLowerCase() === "inherit") continue;
    if (value === null || (value !== undefined && value.toLowerCase() !== "initial")) opacity = value;
    break;
  }
  return {
    fill: paint(values.fill),
    stroke: paint(values.stroke),
    "fill-opacity": alpha(values["fill-opacity"]),
    "stroke-opacity": alpha(values["stroke-opacity"]),
    opacity: alpha(opacity),
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
