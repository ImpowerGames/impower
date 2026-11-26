import { normalizeMorphKeyframes } from "../compiler/morph/normalizeMorphKeyframes";
import { MORPH_LAYER_PROPERTIES } from "../compiler/morph/morphSchema";

export type MorphMotionProperty = (typeof MORPH_LAYER_PROPERTIES)[number];

export const MORPH_MOTION_CSS: Record<MorphMotionProperty, string> = {
  translate: "translate",
  rotate: "rotate",
  scale: "scale",
  transform: "transform",
  transform_origin: "transform-origin",
  opacity: "opacity",
};

export const MORPH_MOTION_REST: Record<MorphMotionProperty, string> = {
  translate: "0px",
  rotate: "0deg",
  scale: "1",
  transform: "none",
  transform_origin: "50% 50%",
  opacity: "1",
};

export const MORPH_MOTION_WRAPPER_STYLE = "transform-box:fill-box;transform-origin:50% 50%";

export interface MorphMotionFrame {
  offset: number;
  values: Partial<Record<MorphMotionProperty, string>>;
}

export type MorphMotion = Record<string, MorphMotionFrame[]>;

type Kind = "length" | "angle" | "number";

const UNITS: Record<Kind, readonly string[]> = {
  length: ["px", "%"],
  angle: ["deg", "rad", "grad", "turn"],
  number: [],
};

const THREE_D_FUNCTIONS = new Set(
  ["matrix3d", "translate3d", "translatez", "scale3d", "scalez", "rotate3d", "rotatex", "rotatey", "rotatez", "perspective"],
);

const FUNCTIONS: Record<string, Kind[][]> = {
  translate: [["length"], ["length", "length"]],
  translatex: [["length"]],
  translatey: [["length"]],
  scale: [["number"], ["number", "number"]],
  scalex: [["number"]],
  scaley: [["number"]],
  rotate: [["angle"]],
  skew: [["angle"], ["angle", "angle"]],
  skewx: [["angle"]],
  skewy: [["angle"]],
  matrix: [["number", "number", "number", "number", "number", "number"]],
};

const FUNCTION_NAMES = "`translate()`, `translateX()`, `translateY()`, `scale()`, `scaleX()`, `scaleY()`, `rotate()`, `skew()`, `skewX()`, `skewY()` and `matrix()`";

const THREE_D = "3D transforms are not supported. Use 2D functions such as `translate()`, `rotate()`, `scale()`, `skew()` or `matrix()`.";

function splitTop(text: string, separator: (ch: string) => boolean): string[] | undefined {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of text) {
    if (ch === "(") depth += 1;
    if (ch === ")") {
      depth -= 1;
      if (depth < 0) return undefined;
    }
    if (depth === 0 && separator(ch)) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (depth !== 0) return undefined;
  parts.push(current);
  return parts;
}

const isSpace = (ch: string) => ch === " " || ch === "\t" || ch === "\n" || ch === "\r";

const words = (text: string): string[] | undefined => splitTop(text.trim(), isSpace)?.filter((part) => part !== "");

type Token = { kind: "value"; type: Kind | "percent" } | { kind: "op"; op: string; spaced: boolean } | { kind: "open" } | { kind: "close" };

const TOKEN = /^([-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?)([a-z]+|%)?/i;

function dimension(text: string): { value: number; unit: string; length: number } | undefined {
  const match = TOKEN.exec(text);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) ? { value, unit: (match[2] ?? "").toLowerCase(), length: match[0].length } : undefined;
}

function unitType(unit: string): Kind | "percent" | undefined {
  if (unit === "") return "number";
  if (unit === "%") return "percent";
  for (const kind of ["length", "angle"] as const) if (UNITS[kind].includes(unit)) return kind;
  return undefined;
}

function calcType(body: string): Kind | "percent" | undefined {
  const tokens: Token[] = [];
  let i = 0;
  let spaced = false;
  while (i < body.length) {
    const ch = body[i]!;
    if (isSpace(ch)) {
      spaced = true;
      i += 1;
      continue;
    }
    const previous = tokens[tokens.length - 1];
    const operand = !previous || previous.kind === "op" || previous.kind === "open";
    if (ch === "(") {
      tokens.push({ kind: "open" });
      i += 1;
    } else if (ch === ")") {
      tokens.push({ kind: "close" });
      i += 1;
    } else if (body.slice(i, i + 5).toLowerCase() === "calc(") {
      tokens.push({ kind: "open" });
      i += 5;
    } else if ("*/".includes(ch) || ("+-".includes(ch) && !operand)) {
      const after = body[i + 1];
      tokens.push({ kind: "op", op: ch, spaced: spaced && (after === undefined || isSpace(after)) });
      i += 1;
    } else {
      const parsed = dimension(body.slice(i));
      const type = parsed && unitType(parsed.unit);
      if (!parsed || !type) return undefined;
      tokens.push({ kind: "value", type });
      i += parsed.length;
    }
    spaced = false;
  }
  let at = 0;
  type T = Kind | "percent" | undefined;
  const lengthish = (t: T) => (t === "percent" ? "length" : t);
  const sum = (): T => {
    let left = product();
    while (tokens[at]?.kind === "op" && "+-".includes((tokens[at] as { op: string }).op)) {
      if (!(tokens[at] as { spaced: boolean }).spaced) return undefined;
      at += 1;
      const right = product();
      if (!left || !right) return undefined;
      if (left === right) continue;
      if (lengthish(left) === "length" && lengthish(right) === "length") left = "length";
      else return undefined;
    }
    return left;
  };
  const product = (): T => {
    let left = factor();
    while (tokens[at]?.kind === "op" && "*/".includes((tokens[at] as { op: string }).op)) {
      const op = (tokens[at] as { op: string }).op;
      at += 1;
      const right = factor();
      if (!left || !right) return undefined;
      if (right === "number") continue;
      if (op === "*" && left === "number") left = right;
      else return undefined;
    }
    return left;
  };
  const factor = (): T => {
    const token = tokens[at];
    if (!token) return undefined;
    if (token.kind === "value") {
      at += 1;
      return token.type;
    }
    if (token.kind === "open") {
      at += 1;
      const inner = sum();
      if (tokens[at]?.kind !== "close") return undefined;
      at += 1;
      return inner;
    }
    return undefined;
  };
  const type = sum();
  return at === tokens.length ? type : undefined;
}

function valueFits(text: string, kind: Kind, percent: boolean): boolean {
  const call = /^calc\((.*)\)$/is.exec(text);
  if (call) {
    const type = calcType(call[1]!);
    return type === kind || (type === "percent" && kind === "length");
  }
  const parsed = dimension(text);
  if (!parsed || parsed.length !== text.length) return false;
  if (parsed.unit === "") return kind === "number" || parsed.value === 0;
  if (parsed.unit === "%") return percent || kind === "length";
  return UNITS[kind].includes(parsed.unit);
}

const ORIGIN_X = new Set(["left", "right"]);
const ORIGIN_Y = new Set(["top", "bottom"]);

function originProblem(parts: string[]): string | null {
  if (parts.length > 2) return "Only a 2D `transform_origin` is supported: write at most two values, such as `left top` or `50% 0`.";
  const keyword = (p: string) => p.toLowerCase();
  const axis = (p: string): "x" | "y" | "center" | "length" | undefined => {
    const k = keyword(p);
    if (ORIGIN_X.has(k)) return "x";
    if (ORIGIN_Y.has(k)) return "y";
    if (k === "center") return "center";
    return valueFits(p, "length", true) ? "length" : undefined;
  };
  const axes = parts.map(axis);
  if (axes.some((a) => a === undefined)) {
    return "`transform_origin` is one or two positions: `left`, `center`, `right`, `top`, `bottom`, a length in `px`, a percentage of the layer's own box, or a `calc()` of them.";
  }
  if (axes.length === 2) {
    const [a, b] = axes as string[];
    const valid = (a !== "y" || b === "x" || b === "center") && (b !== "x" || a === "y" || a === "center");
    if (!valid) return "`transform_origin` names a horizontal position, then a vertical one, such as `left top` or `25% 0`.";
  }
  return null;
}

function transformProblem(text: string): string | null {
  if (text.trim().toLowerCase() === "none") return null;
  const functions: string[] = [];
  let rest = text.trim();
  while (rest) {
    const match = /^([a-z][a-z0-9]*)\(/i.exec(rest);
    if (!match) return `\`${text.trim()}\` is not a transform list. Write 2D functions such as \`rotate(2deg) translate(1px, 2px)\`.`;
    let depth = 0;
    let end = -1;
    for (let i = match[1]!.length; i < rest.length; i++) {
      if (rest[i] === "(") depth += 1;
      if (rest[i] === ")" && --depth === 0) {
        end = i;
        break;
      }
    }
    if (end < 0) return `\`${text.trim()}\` has a parenthesis left open.`;
    functions.push(rest.slice(0, end + 1));
    rest = rest.slice(end + 1).trimStart();
  }
  for (const fn of functions) {
    const open = fn.indexOf("(");
    const name = fn.slice(0, open).toLowerCase();
    if (THREE_D_FUNCTIONS.has(name)) return THREE_D;
    const signatures = FUNCTIONS[name];
    if (!signatures) return `\`${fn.slice(0, open)}()\` is not a 2D transform function. Use ${FUNCTION_NAMES}.`;
    const args = splitTop(fn.slice(open + 1, -1), (ch) => ch === ",")?.map((a) => a.trim());
    const fits = !!args && signatures.some((kinds) => kinds.length === args.length && kinds.every((kind, i) => valueFits(args[i]!, kind, false)));
    if (!fits) {
      const shape = signatures.map((kinds) => `\`${fn.slice(0, open)}(${kinds.map((k) => (k === "length" ? "length" : k)).join(", ")})\``).join(" or ");
      return `\`${fn}\` takes ${shape}, with lengths in \`px\` or percentages of the layer's own box, angles in \`deg\`, \`rad\`, \`grad\` or \`turn\`, separated by commas.`;
    }
  }
  return null;
}

export function morphMotionProblem(property: MorphMotionProperty, value: unknown): string | null {
  if (property === "opacity") {
    if (typeof value === "number") return value >= 0 && value <= 1 ? null : "`opacity` must be between 0 and 1.";
    const percent = typeof value === "string" ? /^(\d+(?:\.\d+)?|\.\d+)%$/.exec(value.trim()) : null;
    if (percent && Number(percent[1]) <= 100) return null;
    return "`opacity` is a number from 0 to 1, or a percentage.";
  }
  if (typeof value !== "string" && typeof value !== "number") {
    return `\`${property}\` takes a value such as ${property === "rotate" ? "`5deg`" : "`0 8px`"}, not a container.`;
  }
  const text = String(value).trim();
  if (text === "") return `\`${property}\` needs a value.`;
  if (/[^\x20-\x7e\t\r\n]/.test(text) || /[;{}!\\"'`]/.test(text)) {
    return `\`${property}\` is written in plain ASCII without quotes, braces, \`!\` or \`;\`.`;
  }
  if (property === "transform") return transformProblem(text);
  const parts = words(text);
  if (!parts || parts.length === 0) return `\`${text}\` has a parenthesis left open.`;
  if (property === "transform_origin") return originProblem(parts);
  if (text.toLowerCase() === "none") return null;
  if (property === "rotate") {
    if (parts.length > 1) return "Only 2D rotation is supported: write one angle, such as `5deg`.";
    return valueFits(parts[0]!, "angle", false) ? null : "`rotate` is an angle, such as `5deg`, `-0.1turn` or `0`.";
  }
  if (parts.length > 2) return `Only 2D \`${property}\` is supported: write at most two values (\`x y\`).`;
  if (property === "translate") {
    return parts.every((p) => valueFits(p, "length", true))
      ? null
      : "`translate` is one or two lengths, `x y`: lengths in `px`, percentages of the layer's own box or a `calc()` of them, such as `0 8px`. A bare number other than `0` needs `px`.";
  }
  return parts.every((p) => valueFits(p, "number", true))
    ? null
    : "`scale` is one or two factors, `x y`: numbers or percentages, such as `1.1` or `100% 90%`.";
}

export function morphMotionCss(property: MorphMotionProperty, value: unknown): string | undefined {
  if (morphMotionProblem(property, value) !== null) return undefined;
  if (property === "opacity") {
    if (typeof value === "number") return String(value);
    return String(Number(String(value).trim().slice(0, -1)) / 100);
  }
  return String(value).trim().replace(/\s+/g, " ");
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === "object" && !Array.isArray(value);

export function morphMotionLabels(keyframes: unknown): string[] {
  const labels = new Set<string>();
  if (!Array.isArray(keyframes)) return [];
  for (const keyframe of keyframes) {
    if (!isRecord(keyframe)) continue;
    for (const [key, container] of Object.entries(keyframe)) {
      if (key === "offset" || !isRecord(container)) continue;
      if (MORPH_LAYER_PROPERTIES.some((p) => morphMotionCss(p, container[p]) !== undefined)) labels.add(key);
    }
  }
  return [...labels].sort();
}

export function buildMorphMotion(keyframes: unknown): MorphMotion | undefined {
  if (!Array.isArray(keyframes)) return undefined;
  const frames = normalizeMorphKeyframes(keyframes)
    .map((frame, index) => ({ frame, index }))
    .sort((a, b) => (a.frame["offset"] as number) - (b.frame["offset"] as number) || a.index - b.index)
    .map(({ frame }) => frame);
  const entries: [string, MorphMotionFrame[]][] = [];
  for (const label of morphMotionLabels(keyframes)) {
    const track: MorphMotionFrame[] = [];
    const set = new Set<MorphMotionProperty>();
    for (const frame of frames) {
      const container = frame[label];
      if (!isRecord(container)) continue;
      const values: MorphMotionFrame["values"] = {};
      for (const property of MORPH_LAYER_PROPERTIES) {
        const css = morphMotionCss(property, container[property]);
        if (css === undefined) continue;
        values[property] = css;
        set.add(property);
      }
      if (Object.keys(values).length) track.push({ offset: frame["offset"] as number, values });
    }
    const ends = (offset: 0 | 1): MorphMotionFrame | undefined => {
      const values: MorphMotionFrame["values"] = {};
      for (const property of set) {
        const at = track.filter((f) => f.values[property] !== undefined);
        const edge = offset === 0 ? at[0]! : at[at.length - 1]!;
        if (edge.offset !== offset) values[property] = MORPH_MOTION_REST[property];
      }
      return Object.keys(values).length ? { offset, values } : undefined;
    };
    const first = ends(0);
    const last = ends(1);
    entries.push([label, [...(first ? [first] : []), ...track, ...(last ? [last] : [])]]);
  }
  return entries.length ? Object.fromEntries(entries) : undefined;
}

export function morphMotionKeyframes(track: readonly MorphMotionFrame[]): Record<string, string | number>[] {
  return track.map(({ offset, values }) => {
    const keyframe: Record<string, string | number> = { offset };
    for (const [property, value] of Object.entries(values) as [MorphMotionProperty, string][]) {
      keyframe[MORPH_MOTION_CSS[property].replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] = value;
    }
    return keyframe;
  });
}
