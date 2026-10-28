// The paint a drawing is drawn with, read from the artwork's attributes and
// inline styles within a closed grammar, and the record a `morph` transition
// keeps of the solid paint its two drawings differ in. Artwork with a style
// sheet is never baked live, so no sheet rule takes part.

import { cssTrim, readAlpha, readColor, type ReadColor } from "./color";
import { ancestry, type ArtDocument, type Element } from "./svgDocument";
import type { MorphColor, MorphPaint } from "./types";

/**
 * A drawing's effective paint. A fill or stroke is a colour or `none`; an
 * undefined value is one the colour reader cannot read (a paint server among
 * them), which does not blend as a colour. `server` names the element a fill
 * or stroke written `url(#id)` paints with.
 */
export interface EffectivePaint {
  fill: MorphColor | "none" | undefined;
  stroke: MorphColor | "none" | undefined;
  "fill-opacity": number | undefined;
  "stroke-opacity": number | undefined;
  opacity: number | undefined;
  server: { fill?: string; stroke?: string };
}

/**
 * A paint server reference with no fallback: `url(#id)`, the function name
 * in any ASCII case and the id in ASCII letters, digits, `_`, `-` and `.`.
 */
const SERVER = /^[Uu][Rr][Ll]\(#([A-Za-z0-9_.-]+)\)$/;

/** The id a fill or stroke value paints with, or undefined when it is not a bare `url(#id)`. */
const serverId = (value: string): string | undefined => SERVER.exec(cssTrim(value))?.[1];

/** The inherited properties and their SVG initial values. */
const INHERITED = { fill: "black", stroke: "none", "fill-opacity": "1", "stroke-opacity": "1", color: "black" };
type Inherited = keyof typeof INHERITED;

// The paint grammar. A paint blends only when every declaration that decides
// it is in this grammar: a fill or stroke as a colour the reader reads, `none`
// or a bare `url(#id)`; `color` and a gradient stop's `stop-color` as a colour
// or `currentColor`; an opacity as a number or a percentage; any of them as
// `inherit` or `initial`; each with an optional trailing `!important`, in
// ASCII with space, tab and line breaks between tokens. A declaration outside
// it (another CSS-wide keyword, `all`, `var()`, a comment, an escape, other
// whitespace, non-ASCII text, a `url()` with a fallback) makes that paint
// unknown, so the pair stays unblended and draws as authored. Reading less
// than a browser does is safe; reading something differently is not.

const KEYWORDS = new Set(["inherit", "initial"]);

const inGrammar = (name: string, value: string): boolean => {
  if (KEYWORDS.has(value.toLowerCase())) return true;
  if (name === "fill" || name === "stroke") return readColor(value) !== undefined || serverId(value) !== undefined;
  if (name === "color" || name === "stop-color") return ["color", "current"].includes(readColor(value)?.kind ?? "");
  return readAlpha(value) !== undefined;
};

/** An inline style the grammar cannot split safely: non-ASCII text, a comment, an escape or a string. */
const STYLE_OUTSIDE = /[^\x20-\x7e\t\n\r\f]|\/\*|\\|["']/;

const IMPORTANT = /![ \t\n\r\f]*important$/i;

/** An element's inline style declarations in order, or null for a style outside the grammar. */
function inlineDeclarations(element: Element): { name: string; value: string; important: boolean }[] | null {
  const style = element.attributes["style"];
  if (style === undefined) return [];
  if (STYLE_OUTSIDE.test(style)) return null;
  const out: { name: string; value: string; important: boolean }[] = [];
  for (const declaration of style.split(";")) {
    const colon = declaration.indexOf(":");
    if (colon < 0) continue;
    const name = cssTrim(declaration.slice(0, colon)).toLowerCase();
    const value = cssTrim(declaration.slice(colon + 1));
    const important = IMPORTANT.test(value);
    if (name) out.push({ name, value: important ? cssTrim(value.replace(IMPORTANT, "")) : value, important });
  }
  return out;
}

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

/**
 * The value of a property that does not inherit unless it says so, as
 * declared on `element` or, through `inherit`, an ancestor; `initial` when
 * none declares it. Null when the deciding declaration is outside the grammar.
 */
const uninherited = (doc: ArtDocument, element: Element, name: string, initial: string): string | null => {
  for (const { element: e } of ancestry(doc, element)) {
    const value = declared(e, name);
    if (value?.toLowerCase() === "inherit") continue;
    if (value === null || (value !== undefined && value.toLowerCase() !== "initial")) return value;
    break;
  }
  return initial;
};

/** The inherited paint properties' values at `element`; null marks a value outside the grammar. */
function inheritedValues(doc: ArtDocument, element: Element): Record<Inherited, string | null> {
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
  return values;
}

/** A colour value as drawn, `currentColor` read through the colour `color` resolves to. */
const resolveColor = (value: string | null, color: string | null): MorphColor | "none" | undefined => {
  const read: ReadColor | undefined = value === null ? undefined : readColor(value);
  const current = color === null ? undefined : readColor(color);
  const resolved = read?.kind === "current" ? (current?.kind === "color" ? current : undefined) : read;
  if (!resolved) return undefined;
  return resolved.kind === "none" ? "none" : resolved.color;
};

const alpha = (value: string | null) => (value === null ? undefined : readAlpha(value));

/** Resolves `element`'s effective paint, its ancestors' inherited values included. */
export function effectivePaint(doc: ArtDocument, element: Element): EffectivePaint {
  const values = inheritedValues(doc, element);
  const server: EffectivePaint["server"] = {};
  for (const name of ["fill", "stroke"] as const) {
    const id = values[name] === null ? undefined : serverId(values[name]!);
    if (id !== undefined) server[name] = id;
  }
  return {
    fill: resolveColor(values.fill, values.color),
    stroke: resolveColor(values.stroke, values.color),
    "fill-opacity": alpha(values["fill-opacity"]),
    "stroke-opacity": alpha(values["stroke-opacity"]),
    opacity: alpha(uninherited(doc, element, "opacity", "1")),
    server,
  };
}

/** Inline declarations a gradient stop may carry: what decides its colour. */
const STOP_PROPERTIES = new Set(["stop-color", "stop-opacity", "color"]);

/**
 * A gradient stop's colour with its `stop-opacity` folded into the alpha, or
 * undefined when the stop's paint is outside the grammar or its inline style
 * declares anything else. Neither stop property inherits unless it says so;
 * `currentColor` reads `color`, which does.
 */
export function stopColor(doc: ArtDocument, stop: Element): MorphColor | undefined {
  const inline = inlineDeclarations(stop);
  if (inline === null || inline.some((d) => !STOP_PROPERTIES.has(d.name))) return undefined;
  const color = resolveColor(uninherited(doc, stop, "stop-color", "black"), inheritedValues(doc, stop).color);
  const opacity = alpha(uninherited(doc, stop, "stop-opacity", "1"));
  if (!Array.isArray(color) || opacity === undefined) return undefined;
  return [color[0], color[1], color[2], color[3] * opacity];
}

const sameColor = (a: MorphColor | "none" | undefined, b: MorphColor | "none" | undefined) =>
  a === b || (Array.isArray(a) && Array.isArray(b) && a.every((v, i) => v === b[i]));

/**
 * The paint record of a `morph` transition from `from` to `to` drawn on a
 * node copied from `home`: each property `home` would not already show at
 * both ends, with both ends' values. Undefined when there is none. A fill or
 * stroke in `gradients` blends as a gradient (`gradient.ts`), so only its
 * opacity is recorded here.
 */
export function paintBlend(
  from: EffectivePaint,
  to: EffectivePaint,
  home: EffectivePaint,
  gradients: { fill?: boolean; stroke?: boolean } = {},
): MorphPaint | undefined {
  const out: MorphPaint = {};
  const differs = <T>(name: keyof EffectivePaint, same: (a: T, b: T) => boolean) =>
    !same(from[name] as T, to[name] as T) || !same(from[name] as T, home[name] as T);
  for (const name of ["fill", "stroke"] as const) {
    const a = from[name];
    const b = to[name];
    const gradient = !!gradients[name];
    // A paint either end cannot read keeps the paint of the node it draws on.
    if (!gradient && (a === undefined || b === undefined)) continue;
    const opacity = `${name}-opacity` as const;
    if (!gradient && a !== undefined && b !== undefined && differs(name, sameColor)) {
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
