// Where CSS draws one background image layer: the rectangle a `no-repeat`
// background of a given intrinsic size occupies in its positioning area, by
// CSS Backgrounds 3 (https://www.w3.org/TR/css-backgrounds-3/#background-size)
// and the default sizing algorithm of CSS Images 3. A live portrait drawn
// inline is placed on that rectangle, so it lands on the pixels the static
// image it replaces painted.

import { cssList } from "../../../../sparkdown/src/morph/cssList";

export { cssList };

/** What an image says about its own size: intrinsic dimensions and ratio. */
export interface IntrinsicSize {
  width?: number;
  height?: number;
  /** Width over height. */
  ratio?: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One axis of `background-position`: a fraction of the free space plus pixels. */
interface PositionAxis {
  fraction: number;
  px: number;
}

const px = (text: string | undefined): number | undefined => {
  if (text === undefined) return undefined;
  const m = /^\s*([-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?)(px)?\s*$/i.exec(text);
  return m ? Number(m[1]) : undefined;
};

/**
 * An SVG root's intrinsic size: `width` and `height` in pixels (or unitless),
 * and the ratio of its `viewBox`, else of those dimensions. A percentage or
 * other relative length gives no intrinsic dimension.
 */
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

/** The image's size under `contain` or `cover` in a W×H area. */
const fitted = (ratio: number, w: number, h: number, cover: boolean) => {
  const wide = w / h > ratio;
  return wide === cover ? { width: w, height: w / ratio } : { width: h * ratio, height: h };
};

/**
 * The concrete size of a layer whose `background-size` is `size` (a computed
 * value: `cover`, `contain`, or one or two of `auto`, a length in pixels or
 * a percentage), or undefined for a value this cannot follow.
 */
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
    // The default sizing algorithm with no specified size.
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

/** One axis value: `50%`, `10px`, `calc(100% - 10px)`, a keyword. */
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

/**
 * A computed `background-position` for one layer (`50% 50%`, `0px 100%`,
 * `calc(100% - 10px) 0%`, or keyword forms with edge offsets) as its two
 * axes, or undefined for a value this cannot follow.
 */
export function backgroundPosition(position: string): { x: PositionAxis; y: PositionAxis } | undefined {
  const tokens = position.trim().toLowerCase().match(/calc\([^)]*\)|\S+/g) ?? [];
  if (tokens.length === 2) {
    const [a, b] = tokens as [string, string];
    // Keywords may be written y first (`top left`).
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
    // Edge offsets: `right 10px bottom 20%`, `left 10px top`.
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

/**
 * The rectangle one `no-repeat` background layer paints in its positioning
 * area, or undefined when its size or position is a value this cannot
 * follow (a player then leaves the layer to CSS).
 */
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

/**
 * Entry `index` of a computed comma-separated background list, counted from
 * the top layer as CSS lists them; a list shorter than the layers repeats.
 */
export function layerValue(list: string, index: number): string {
  const values = cssList(list);
  return values[index % values.length] ?? "";
}
