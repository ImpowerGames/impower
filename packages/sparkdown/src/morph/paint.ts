import { cssTrim, readAlpha, readColor, type ReadColor } from "./color";
import { ancestry, inlineDeclarations, type ArtDocument, type Element } from "./svgDocument";
import type { MorphColor, MorphPaint } from "./types";

export interface EffectivePaint {
  fill: MorphColor | "none" | undefined;
  stroke: MorphColor | "none" | undefined;
  "fill-opacity": number | undefined;
  "stroke-opacity": number | undefined;
  opacity: number | undefined;
  server: { fill?: string; stroke?: string };
}

const SERVER = /^[Uu][Rr][Ll]\(#([A-Za-z0-9_.-]+)\)$/;

const serverId = (value: string): string | undefined => SERVER.exec(cssTrim(value))?.[1];

const INHERITED = { fill: "black", stroke: "none", "fill-opacity": "1", "stroke-opacity": "1", color: "black" };
type Inherited = keyof typeof INHERITED;

const KEYWORDS = new Set(["inherit", "initial"]);

const inGrammar = (name: string, value: string): boolean => {
  if (KEYWORDS.has(value.toLowerCase())) return true;
  if (name === "fill" || name === "stroke") return readColor(value) !== undefined || serverId(value) !== undefined;
  if (name === "color" || name === "stop-color") return ["color", "current"].includes(readColor(value)?.kind ?? "");
  return readAlpha(value) !== undefined;
};

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

const uninherited = (doc: ArtDocument, element: Element, name: string, initial: string): string | null => {
  for (const { element: e } of ancestry(doc, element)) {
    const value = declared(e, name);
    if (value?.toLowerCase() === "inherit") continue;
    if (value === null || (value !== undefined && value.toLowerCase() !== "initial")) return value;
    break;
  }
  return initial;
};

function inheritedValues(doc: ArtDocument, element: Element): Record<Inherited, string | null> {
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
      if (name === "color" && keyword === "currentcolor") continue;
      values[name] = keyword === "initial" ? INHERITED[name] : value;
    }
  }
  return values;
}

const resolveColor = (value: string | null, color: string | null): MorphColor | "none" | undefined => {
  const read: ReadColor | undefined = value === null ? undefined : readColor(value);
  const current = color === null ? undefined : readColor(color);
  const resolved = read?.kind === "current" ? (current?.kind === "color" ? current : undefined) : read;
  if (!resolved) return undefined;
  return resolved.kind === "none" ? "none" : resolved.color;
};

const alpha = (value: string | null) => (value === null ? undefined : readAlpha(value));

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

const STOP_PROPERTIES = new Set(["stop-color", "stop-opacity", "color"]);

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
    if (!gradient && (a === undefined || b === undefined)) continue;
    const opacity = `${name}-opacity` as const;
    if (!gradient && a !== undefined && b !== undefined && differs(name, sameColor)) {
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
