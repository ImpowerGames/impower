import { cssList } from "../../../../sparkdown/src/morph/cssList";

export { cssList };

export interface IntrinsicSize {
  width?: number;
  height?: number;
  ratio?: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PositionAxis {
  fraction: number;
  px: number;
}

const px = (text: string | undefined): number | undefined => {
  if (text === undefined) return undefined;
  const m = /^\s*([-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?)(px)?\s*$/i.exec(text);
  return m ? Number(m[1]) : undefined;
};

export function svgIntrinsicSize(attributes: { viewBox?: string; width?: string; height?: string }): IntrinsicSize {
  const width = px(attributes.width);
  const height = px(attributes.height);
  const box = attributes.viewBox?.trim().split(/[\s,]+/).map(Number);
  const size: IntrinsicSize = {};
  if (width !== undefined && width >= 0) size.width = width;
  if (height !== undefined && height >= 0) size.height = height;
  if (box && box.length === 4 && box.every(Number.isFinite) && box[2]! > 0 && box[3]! > 0) {
    size.ratio = box[2]! / box[3]!;
  } else if (size.width && size.height) {
    size.ratio = size.width / size.height;
  }
  return size;
}

const fitted = (ratio: number, w: number, h: number, cover: boolean) => {
  const wide = w / h > ratio;
  return wide === cover ? { width: w, height: w / ratio } : { width: h * ratio, height: h };
};

export function backgroundSize(size: string, area: { width: number; height: number }, image: IntrinsicSize) {
  const { width: W, height: H } = area;
  const text = size.trim().toLowerCase();
  if (text === "cover" || text === "contain") {
    return image.ratio ? fitted(image.ratio, W, H, text === "cover") : { width: W, height: H };
  }
  const tokens = text.split(/\s+/);
  if (tokens.length > 2) return undefined;
  const resolve = (token: string, full: number): number | "auto" | undefined => {
    if (token === "auto") return "auto";
    if (token.endsWith("%")) {
      const n = Number(token.slice(0, -1));
      return Number.isFinite(n) ? (n / 100) * full : undefined;
    }
    return px(token);
  };
  const w = resolve(tokens[0]!, W);
  const h = resolve(tokens[1] ?? "auto", H);
  if (w === undefined || h === undefined) return undefined;
  if (w !== "auto" && h !== "auto") return { width: w, height: h };
  if (w === "auto" && h === "auto") {
    if (image.width !== undefined && image.height !== undefined) return { width: image.width, height: image.height };
    if (image.width !== undefined && image.ratio) return { width: image.width, height: image.width / image.ratio };
    if (image.height !== undefined && image.ratio) return { width: image.height * image.ratio, height: image.height };
    if (image.ratio) return fitted(image.ratio, W, H, false);
    return { width: image.width ?? W, height: image.height ?? H };
  }
  if (w === "auto") {
    const height = h as number;
    return { width: image.ratio ? height * image.ratio : (image.width ?? W), height };
  }
  return { width: w, height: image.ratio ? w / image.ratio : (image.height ?? H) };
}

const KEYWORD: Record<string, number> = { left: 0, top: 0, center: 0.5, right: 1, bottom: 1 };

function positionAxis(text: string): PositionAxis | undefined {
  const t = text.trim().toLowerCase();
  if (Object.hasOwn(KEYWORD, t)) return { fraction: KEYWORD[t]!, px: 0 };
  if (t.endsWith("%") && !t.startsWith("calc")) {
    const n = Number(t.slice(0, -1));
    return Number.isFinite(n) ? { fraction: n / 100, px: 0 } : undefined;
  }
  const length = px(t);
  if (length !== undefined) return { fraction: 0, px: length };
  const calc = /^calc\(\s*([-+]?[\d.]+)%\s*([-+])\s*([\d.]+)px\s*\)$/.exec(t);
  if (calc) {
    const sign = calc[2] === "-" ? -1 : 1;
    return { fraction: Number(calc[1]) / 100, px: sign * Number(calc[3]) };
  }
  return undefined;
}

export function backgroundPosition(position: string): { x: PositionAxis; y: PositionAxis } | undefined {
  const tokens = position.trim().toLowerCase().match(/calc\([^)]*\)|\S+/g) ?? [];
  if (tokens.length === 2) {
    const [a, b] = tokens as [string, string];
    const swap = (a === "top" || a === "bottom") && !(b === "top" || b === "bottom");
    const x = positionAxis(swap ? b : a);
    const y = positionAxis(swap ? a : b);
    return x && y ? { x, y } : undefined;
  }
  if (tokens.length === 1) {
    const only = tokens[0]!;
    const axis = positionAxis(only);
    if (!axis) return undefined;
    const center = { fraction: 0.5, px: 0 };
    return only === "top" || only === "bottom" ? { x: center, y: axis } : { x: axis, y: center };
  }
  if (tokens.length === 4 || tokens.length === 3) {
    const axes: Partial<Record<"x" | "y", PositionAxis>> = {};
    for (let i = 0; i < tokens.length; i++) {
      const edge = tokens[i]!;
      if (!Object.hasOwn(KEYWORD, edge)) return undefined;
      const next = tokens[i + 1];
      const offset = next !== undefined && !Object.hasOwn(KEYWORD, next) ? positionAxis(next) : undefined;
      if (offset) i++;
      const far = edge === "right" || edge === "bottom";
      const value: PositionAxis =
        edge === "center"
          ? { fraction: 0.5, px: 0 }
          : offset
            ? far
              ? { fraction: 1 - offset.fraction, px: -offset.px }
              : offset
            : { fraction: KEYWORD[edge]!, px: 0 };
      const key = edge === "top" || edge === "bottom" ? "y" : edge === "left" || edge === "right" ? "x" : axes.x ? "y" : "x";
      axes[key] = value;
    }
    return axes.x && axes.y ? { x: axes.x, y: axes.y } : undefined;
  }
  return undefined;
}

export function backgroundRect(
  area: { width: number; height: number },
  image: IntrinsicSize,
  size: string,
  position: string,
): Rect | undefined {
  const concrete = backgroundSize(size, area, image);
  const pos = backgroundPosition(position);
  if (!concrete || !pos) return undefined;
  return {
    x: (area.width - concrete.width) * pos.x.fraction + pos.x.px,
    y: (area.height - concrete.height) * pos.y.fraction + pos.y.px,
    width: concrete.width,
    height: concrete.height,
  };
}

export function layerValue(list: string, index: number): string {
  const values = cssList(list);
  return values[index % values.length] ?? "";
}
