import type { Subpath } from "../types";
import { parsePathData } from "./parse";

/**
 * The SVG basic shapes, given as plain attribute values. Missing lengths
 * default to zero as in SVG; `points` is the raw `points` attribute text.
 */
export type BasicShape =
  | { kind: "rect"; x?: number; y?: number; width: number; height: number; rx?: number; ry?: number }
  | { kind: "circle"; cx?: number; cy?: number; r: number }
  | { kind: "ellipse"; cx?: number; cy?: number; rx: number; ry: number }
  | { kind: "line"; x1?: number; y1?: number; x2?: number; y2?: number }
  | { kind: "polyline"; points: string | number[] }
  | { kind: "polygon"; points: string | number[] };

const nums = (points: string | number[]): number[] =>
  Array.isArray(points)
    ? points
    : (points.match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? []).map(Number);

/**
 * The equivalent path data for a basic shape, following the SVG spec. A
 * shape SVG would not render (a zero or negative width, height or radius)
 * yields empty path data, so absent art never becomes morphable geometry.
 */
export function basicShapeToPathData(shape: BasicShape): string {
  switch (shape.kind) {
    case "rect": {
      const x = shape.x ?? 0,
        y = shape.y ?? 0,
        w = shape.width,
        h = shape.height;
      if (!(w > 0) || !(h > 0)) return "";
      // A negative corner radius is an error in SVG; treat it as unset.
      let rx = Math.max(0, shape.rx ?? shape.ry ?? 0),
        ry = Math.max(0, shape.ry ?? shape.rx ?? 0);
      rx = Math.min(rx, w / 2);
      ry = Math.min(ry, h / 2);
      if (rx === 0 || ry === 0) return `M${x},${y}H${x + w}V${y + h}H${x}Z`;
      return (
        `M${x + rx},${y}H${x + w - rx}A${rx},${ry} 0 0 1 ${x + w},${y + ry}` +
        `V${y + h - ry}A${rx},${ry} 0 0 1 ${x + w - rx},${y + h}` +
        `H${x + rx}A${rx},${ry} 0 0 1 ${x},${y + h - ry}` +
        `V${y + ry}A${rx},${ry} 0 0 1 ${x + rx},${y}Z`
      );
    }
    case "circle":
      return basicShapeToPathData({ kind: "ellipse", cx: shape.cx, cy: shape.cy, rx: shape.r, ry: shape.r });
    case "ellipse": {
      const cx = shape.cx ?? 0,
        cy = shape.cy ?? 0,
        rx = shape.rx,
        ry = shape.ry;
      if (!(rx > 0) || !(ry > 0)) return "";
      return (
        `M${cx + rx},${cy}A${rx},${ry} 0 0 1 ${cx},${cy + ry}A${rx},${ry} 0 0 1 ${cx - rx},${cy}` +
        `A${rx},${ry} 0 0 1 ${cx},${cy - ry}A${rx},${ry} 0 0 1 ${cx + rx},${cy}Z`
      );
    }
    case "line":
      return `M${shape.x1 ?? 0},${shape.y1 ?? 0}L${shape.x2 ?? 0},${shape.y2 ?? 0}`;
    case "polyline":
    case "polygon": {
      const n = nums(shape.points);
      if (n.length < 2) return "";
      let d = `M${n[0]},${n[1]}`;
      for (let i = 2; i + 1 < n.length; i += 2) d += `L${n[i]},${n[i + 1]}`;
      return shape.kind === "polygon" ? `${d}Z` : d;
    }
  }
}

/** Parses a basic shape straight to cubic subpaths. */
export function basicShapeToSubpaths(shape: BasicShape): Subpath[] {
  return parsePathData(basicShapeToPathData(shape));
}
