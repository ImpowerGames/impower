// The solid paint a drawing is drawn with, resolved as a browser would from
// the artwork's attributes and inline styles, and the record a `morph`
// transition keeps of the paint its two drawings differ in. Artwork with a
// style sheet is never baked live, so no sheet rule takes part.

import { readAlpha, readColor, type ReadColor } from "./color";
import { ancestry, styleDeclarations, type ArtDocument, type Element } from "./svgDocument";
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

const IMPORTANT = /!\s*important\s*$/i;

/**
 * Whether a browser drops this declaration as invalid, so that the next one
 * in the cascade applies: `none` is paint, not a colour.
 */
const dropped = (name: string, value: string) => name === "color" && value.trim().toLowerCase() === "none";

/**
 * What an element declares for `name`, as the cascade picks it once invalid
 * declarations are dropped: its inline style (the last important declaration,
 * else the last), which outranks the presentation attribute.
 */
const declared = (element: Element, name: string): string | undefined => {
  const inline = styleDeclarations(element)
    .filter(([n]) => n === name)
    .map(([, , clean]) => ({ value: clean.replace(IMPORTANT, "").trim(), important: IMPORTANT.test(clean) }))
    .filter(({ value }) => !dropped(name, value));
  const chosen = inline.findLast((d) => d.important) ?? inline[inline.length - 1];
  if (chosen) return chosen.value;
  const attribute = element.attributes[name]?.trim();
  return attribute === undefined || dropped(name, attribute) ? undefined : attribute;
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
