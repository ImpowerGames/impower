import { isLine } from "../geometry/cubic";
import type { Cubic, Point, Subpath } from "../types";

/**
 * Formats a coordinate. With a precision, rounds to that many decimals and
 * trims trailing zeros; without one, writes the shortest string that reads
 * back as the same number, so authored coordinates survive exactly.
 */
export const formatNumber = (n: number, precision?: number): string => {
  if (precision === undefined) return Object.is(n, -0) ? "0" : String(n);
  const s = n.toFixed(precision);
  const trimmed = s.includes(".") ? s.replace(/\.?0+$/, "") : s;
  return trimmed === "-0" || trimmed === "" ? "0" : trimmed;
};

const pt = (p: Point, precision?: number): string =>
  `${formatNumber(p[0], precision)},${formatNumber(p[1], precision)}`;

/**
 * Serialises one segment list as absolute `M`/`L`/`C` commands. Precision is
 * the number of decimals to keep; omit it to keep every coordinate exact.
 */
export function serializeSegments(segments: Cubic[], closed: boolean, precision?: number): string {
  if (!segments.length) return "";
  let d = `M${pt(segments[0]!.p0, precision)}`;
  for (const s of segments) {
    d += isLine(s) ? `L${pt(s.p1, precision)}` : `C${pt(s.c1, precision)} ${pt(s.c2, precision)} ${pt(s.p1, precision)}`;
  }
  return closed ? `${d}Z` : d;
}

/** Serialises subpaths back to SVG path data; see `serializeSegments`. */
export function serializePathData(subpaths: Subpath[], precision?: number): string {
  return subpaths.map((s) => serializeSegments(s.segments, s.closed, precision)).join("");
}
