import { isLine } from "../geometry/cubic";
import type { Cubic, Point, Subpath } from "../types";

const fmt = (n: number, precision: number): string => {
  const s = n.toFixed(precision);
  // Trim trailing zeros and a dangling decimal point.
  return s.includes(".") ? s.replace(/\.?0+$/, "") || "0" : s;
};

const pt = (p: Point, precision: number): string =>
  `${fmt(p[0], precision)},${fmt(p[1], precision)}`;

/** Serialises one segment list as absolute `M`/`L`/`C` commands. */
export function serializeSegments(segments: Cubic[], closed: boolean, precision = 2): string {
  if (!segments.length) return "";
  let d = `M${pt(segments[0]!.p0, precision)}`;
  for (const s of segments) {
    d += isLine(s) ? `L${pt(s.p1, precision)}` : `C${pt(s.c1, precision)} ${pt(s.c2, precision)} ${pt(s.p1, precision)}`;
  }
  return closed ? `${d}Z` : d;
}

/** Serialises subpaths back to SVG path data. */
export function serializePathData(subpaths: Subpath[], precision = 2): string {
  return subpaths.map((s) => serializeSegments(s.segments, s.closed, precision)).join("");
}
