import type { Rect } from "./backgroundFit";

export interface LayerStyle {
  size: string;
  position: string;
  repeat: string;
  origin: string;
  clip: string;
  blend: string;
}

export interface LayerBoxes {
  border: Rect;
  padding: Rect;
  content: Rect;
}

export interface LayerPaint {
  tiles: Rect[];
  pattern?: { tile: Rect; stepX: number; stepY: number; repeatX: boolean; repeatY: boolean };
  clip: Rect;
  blend: string;
}

export const MAX_LAYER_TILES = 4096;

type Repeat = "repeat" | "no-repeat" | "space" | "round";

const REPEATS = new Set<Repeat>(["repeat", "no-repeat", "space", "round"]);

export function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const c of text.trim()) {
    if (c === "(") depth++;
    else if (c === ")") depth--;
    if (/\s/.test(c) && depth === 0) {
      if (current) parts.push(current);
      current = "";
      continue;
    }
    current += c;
  }
  if (current) parts.push(current);
  return parts;
}

export function cssLength(text: string, reference: number): number | undefined {
  const source = text.trim().toLowerCase();
  let at = 0;
  const space = () => {
    while (at < source.length && /\s/.test(source[at]!)) at++;
  };
  const peek = () => {
    space();
    return source[at];
  };
  const fail = (): never => {
    throw new Error("unparsed");
  };
  const expect = (c: string) => {
    if (peek() !== c) fail();
    at++;
  };
  const list = (): number[] => {
    const values = [sum()];
    while (peek() === ",") {
      at++;
      values.push(sum());
    }
    return values;
  };
  const factor = (): number => {
    const c = peek();
    if (c === "-" || c === "+") {
      at++;
      const value = factor();
      return c === "-" ? -value : value;
    }
    if (c === "(") {
      at++;
      const value = sum();
      expect(")");
      return value;
    }
    const name = /^[a-z-]+(?=\()/.exec(source.slice(at))?.[0];
    if (name) {
      at += name.length + 1;
      const args = list();
      expect(")");
      if (name === "calc" && args.length === 1) return args[0]!;
      if (name === "min" && args.length) return Math.min(...args);
      if (name === "max" && args.length) return Math.max(...args);
      if (name === "clamp" && args.length === 3) return Math.max(args[0]!, Math.min(args[1]!, args[2]!));
      return fail();
    }
    const number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?(px|%)?/.exec(source.slice(at));
    if (!number) return fail();
    at += number[0].length;
    const value = Number(number[0].slice(0, number[0].length - (number[1]?.length ?? 0)));
    return number[1] === "%" ? (value / 100) * reference : value;
  };
  const product = (): number => {
    let value = factor();
    for (let c = peek(); c === "*" || c === "/"; c = peek()) {
      at++;
      const right = factor();
      value = c === "*" ? value * right : value / right;
    }
    return value;
  };
  const sum = (): number => {
    let value = product();
    for (let c = peek(); c === "+" || c === "-"; c = peek()) {
      at++;
      const right = product();
      value = c === "+" ? value + right : value - right;
    }
    return value;
  };
  try {
    const value = sum();
    space();
    return at === source.length && Number.isFinite(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function fitted(ratio: number, width: number, height: number, cover: boolean) {
  const wide = width / height > ratio;
  return wide === cover ? { width, height: width / ratio } : { width: height * ratio, height };
}

export function layerSize(size: string, area: { width: number; height: number }, image: { width: number; height: number }) {
  const ratio = image.width / image.height;
  const text = size.trim().toLowerCase();
  if (text === "cover" || text === "contain") return fitted(ratio, area.width, area.height, text === "cover");
  const tokens = splitTopLevel(text);
  if (tokens.length < 1 || tokens.length > 2) return undefined;
  const resolve = (token: string, full: number) => (token === "auto" ? ("auto" as const) : cssLength(token, full));
  const w = resolve(tokens[0]!, area.width);
  const h = resolve(tokens[1] ?? "auto", area.height);
  if (w === undefined || h === undefined) return undefined;
  if (w === "auto" && h === "auto") return { width: image.width, height: image.height, auto: "both" as const };
  if (w === "auto") return { width: (h as number) * ratio, height: h as number, auto: "width" as const };
  if (h === "auto") return { width: w, height: w / ratio, auto: "height" as const };
  return { width: w, height: h };
}

const EDGES: Record<string, number> = { left: 0, top: 0, center: 50, right: 100, bottom: 100 };

type Axis = { edge: number; offset?: string };

export function layerPosition(position: string): { x: Axis; y: Axis } | undefined {
  const tokens = splitTopLevel(position.toLowerCase());
  const keyword = (t: string | undefined) => t !== undefined && Object.hasOwn(EDGES, t);
  const plain = (t: string): Axis => (keyword(t) ? { edge: EDGES[t]! } : { edge: 0, offset: t });
  if (tokens.length === 1) {
    const only = tokens[0]!;
    const centre: Axis = { edge: 50 };
    return only === "top" || only === "bottom" ? { x: centre, y: plain(only) } : { x: plain(only), y: centre };
  }
  if (tokens.length === 2) {
    const [a, b] = tokens as [string, string];
    const swap = a === "top" || a === "bottom" || b === "left" || b === "right";
    return swap ? { x: plain(b), y: plain(a) } : { x: plain(a), y: plain(b) };
  }
  if (tokens.length === 3 || tokens.length === 4) {
    const axes: Partial<Record<"x" | "y", Axis>> = {};
    for (let i = 0; i < tokens.length; i++) {
      const edge = tokens[i]!;
      if (!keyword(edge)) return undefined;
      const next = tokens[i + 1];
      const offset = next !== undefined && !keyword(next) ? next : undefined;
      if (offset) i++;
      const far = edge === "right" || edge === "bottom";
      const value: Axis = offset ? (far ? { edge: 100, offset: `calc(0px - (${offset}))` } : { edge: 0, offset }) : { edge: EDGES[edge]! };
      const key = edge === "top" || edge === "bottom" ? "y" : edge === "left" || edge === "right" ? "x" : axes.x ? "y" : "x";
      axes[key] = value;
    }
    return axes.x && axes.y ? { x: axes.x, y: axes.y } : undefined;
  }
  return undefined;
}

function axisOffset(axis: Axis, free: number): number | undefined {
  const base = (axis.edge / 100) * free;
  if (!axis.offset) return base;
  const offset = cssLength(axis.offset, free);
  return offset === undefined ? undefined : base + offset;
}

export function layerRepeat(repeat: string): [Repeat, Repeat] | undefined {
  const tokens = splitTopLevel(repeat.toLowerCase());
  if (tokens.length === 1) {
    const only = tokens[0]!;
    if (only === "repeat-x") return ["repeat", "no-repeat"];
    if (only === "repeat-y") return ["no-repeat", "repeat"];
    return REPEATS.has(only as Repeat) ? [only as Repeat, only as Repeat] : undefined;
  }
  if (tokens.length === 2 && tokens.every((t) => REPEATS.has(t as Repeat))) return tokens as [Repeat, Repeat];
  return undefined;
}

const boxOf = (boxes: LayerBoxes, name: string): Rect | undefined =>
  name === "border-box" ? boxes.border : name === "padding-box" ? boxes.padding : name === "content-box" ? boxes.content : undefined;

interface Run {
  first: number;
  step: number;
  count: number;
  repeats: boolean;
}

function axisRun(mode: Repeat, start: number, length: number, area: { at: number; size: number }, clip: { at: number; size: number }): Run {
  if (mode === "no-repeat" || !(length > 0)) return { first: start, step: length, count: 1, repeats: false };
  let step = length;
  let origin = start;
  if (mode === "space") {
    const fits = Math.floor(area.size / length);
    if (fits < 2) return { first: start, step: length, count: 1, repeats: false };
    step = length + (area.size - fits * length) / (fits - 1);
    origin = area.at;
  }
  const first = origin - Math.ceil((origin - clip.at) / step) * step;
  const count = Math.max(1, Math.ceil((clip.at + clip.size - first) / step));
  return { first, step, count, repeats: true };
}

export function layerPaint(style: LayerStyle, boxes: LayerBoxes, image: { width: number; height: number }): LayerPaint | undefined {
  const area = boxOf(boxes, style.origin.trim().toLowerCase() || "padding-box");
  const clip = boxOf(boxes, style.clip.trim().toLowerCase() || "border-box");
  const repeat = layerRepeat(style.repeat || "repeat");
  if (!area || !clip || !repeat || !(image.width > 0 && image.height > 0)) return undefined;
  const sized = layerSize(style.size || "auto", area, image);
  if (!sized || !(sized.width >= 0 && sized.height >= 0)) return undefined;
  let width = sized.width;
  let height = sized.height;
  if (repeat[0] === "round" && width > 0) width = area.width / Math.max(1, Math.round(area.width / width));
  if (repeat[1] === "round" && height > 0) height = area.height / Math.max(1, Math.round(area.height / height));
  if (repeat[0] === "round" && repeat[1] !== "round" && "auto" in sized && sized.auto !== "width") height = (width * image.height) / image.width;
  if (repeat[1] === "round" && repeat[0] !== "round" && "auto" in sized && sized.auto !== "height") width = (height * image.width) / image.height;
  const position = layerPosition(style.position || "0% 0%");
  if (!position) return undefined;
  const x = axisOffset(position.x, area.width - width);
  const y = axisOffset(position.y, area.height - height);
  if (x === undefined || y === undefined) return undefined;
  const blend = style.blend.trim().toLowerCase() || "normal";
  const xs = axisRun(repeat[0], area.x + x, width, { at: area.x, size: area.width }, { at: clip.x, size: clip.width });
  const ys = axisRun(repeat[1], area.y + y, height, { at: area.y, size: area.height }, { at: clip.y, size: clip.height });
  const dense = xs.count * ys.count > MAX_LAYER_TILES;
  const tiles: Rect[] = [];
  if (!dense) {
    for (let j = 0; j < ys.count; j++) {
      for (let i = 0; i < xs.count; i++) tiles.push({ x: xs.first + i * xs.step, y: ys.first + j * ys.step, width, height });
    }
  }
  const patterned = dense || repeat[0] === "repeat" || repeat[0] === "round" || repeat[1] === "repeat" || repeat[1] === "round";
  return {
    tiles,
    ...(patterned
      ? { pattern: { tile: { x: xs.first, y: ys.first, width, height }, stepX: xs.step, stepY: ys.step, repeatX: xs.repeats, repeatY: ys.repeats } }
      : {}),
    clip,
    blend,
  };
}
