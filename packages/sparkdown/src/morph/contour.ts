import { cubicDoublePoint, isLine, splitCubic } from "@impower/spark-morph/src/geometry/cubic";
import { parsePathData, type Point, type Subpath } from "@impower/spark-morph/src/index";

type Cubic = Subpath["segments"][number];

const FLATNESS = 1e-4;
const MAX_DEPTH = 16;

export const pathContours = (d: string): Subpath[] => parsePathData(d).filter((subpath) => subpath.segments.length > 0);

const same = (a: Point, b: Point) => a[0] === b[0] && a[1] === b[1];

const distanceToChord = (p: Point, a: Point, b: Point): number => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy);
  if (length === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs(dx * (p[1] - a[1]) - dy * (p[0] - a[0])) / length;
};

function flattenInto(c: Cubic, tolerance: number, out: Point[], depth = 0) {
  const flat = Math.max(distanceToChord(c.c1, c.p0, c.p1), distanceToChord(c.c2, c.p0, c.p1)) <= tolerance;
  if (flat || isLine(c) || depth >= MAX_DEPTH) {
    out.push(c.p0);
    return;
  }
  const [a, b] = splitCubic(c, 0.5);
  flattenInto(a, tolerance, out, depth + 1);
  flattenInto(b, tolerance, out, depth + 1);
}

const loopsOnItself = (c: Cubic): boolean => {
  const double = cubicDoublePoint(c);
  return !!double && double[0] > 0 && double[1] < 1;
};

export function contourOverlapsItself(contour: Subpath, evenodd: boolean): boolean {
  const { segments } = contour;
  if (!segments.length) return false;
  if (segments.some(loopsOnItself)) return true;
  const xs = segments.flatMap((c) => [c.p0[0], c.c1[0], c.c2[0], c.p1[0]]);
  const ys = segments.flatMap((c) => [c.p0[1], c.c1[1], c.c2[1], c.p1[1]]);
  const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  if (!(size > 0)) return false;
  const points: Point[] = [];
  for (const c of segments) flattenInto(c, size * FLATNESS, points);
  points.push(segments[segments.length - 1]!.p1);
  return polygonOverlapsItself(
    points.filter((p, i) => !same(p, points[(i + 1) % points.length]!)),
    evenodd,
  );
}

const cross = (a: Point, b: Point) => a[0] * b[1] - a[1] * b[0];
const minus = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];

function polygonOverlapsItself(points: Point[], evenodd: boolean): boolean {
  const n = points.length;
  if (n < 4) return false;
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  if (!(size > 0)) return false;
  const tiny = size * 1e-12;
  const edge = (i: number): [Point, Point] => [points[i]!, points[(i + 1) % n]!];
  const bounds = points.map((_, i) => {
    const [a, b] = edge(i);
    return { i, minX: Math.min(a[0], b[0]), maxX: Math.max(a[0], b[0]), minY: Math.min(a[1], b[1]), maxY: Math.max(a[1], b[1]) };
  });
  const order = [...bounds].sort((p, q) => p.minX - q.minX);
  const splits: number[][] = points.map(() => [0, 1]);
  let active: typeof bounds = [];
  for (const e of order) {
    active = active.filter((a) => a.maxX >= e.minX);
    for (const a of active) {
      const i = Math.min(a.i, e.i);
      const j = Math.max(a.i, e.i);
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (a.maxY < e.minY || e.maxY < a.minY) continue;
      const [p, q] = edge(i);
      const [c, d] = edge(j);
      const r = minus(q, p);
      const s = minus(d, c);
      const denominator = cross(r, s);
      const cp = minus(c, p);
      if (Math.abs(denominator) <= tiny * Math.hypot(...r) * Math.hypot(...s)) {
        if (Math.abs(cross(cp, r)) > tiny * Math.hypot(...r)) continue;
        const length = r[0] * r[0] + r[1] * r[1];
        const t0 = (cp[0] * r[0] + cp[1] * r[1]) / length;
        const t1 = t0 + (s[0] * r[0] + s[1] * r[1]) / length;
        if (Math.min(Math.max(t0, t1), 1) - Math.max(Math.min(t0, t1), 0) > 1e-12) return true;
        continue;
      }
      const t = cross(cp, s) / denominator;
      const u = cross(cp, r) / denominator;
      if (t < 0 || t > 1 || u < 0 || u > 1) continue;
      splits[i]!.push(t);
      splits[j]!.push(u);
    }
    active.push(e);
  }
  if (splits.every((list) => list.length === 2)) return false;
  const inside = ([x, y]: Point): boolean => {
    let winding = 0;
    for (let i = 0; i < n; i++) {
      const [[ax, ay], [bx, by]] = edge(i);
      const side = (bx - ax) * (y - ay) - (x - ax) * (by - ay);
      if (ay <= y) {
        if (by > y && side > 0) winding++;
      } else if (by <= y && side < 0) winding--;
    }
    return evenodd ? winding % 2 !== 0 : winding !== 0;
  };
  const eps = size * 1e-7;
  for (let i = 0; i < n; i++) {
    const [a, b] = edge(i);
    const r = minus(b, a);
    const length = Math.hypot(...r);
    const ts = [...new Set(splits[i])].sort((x, y) => x - y);
    for (let k = 0; k + 1 < ts.length; k++) {
      if ((ts[k + 1]! - ts[k]!) * length <= eps * 4) continue;
      const m = (ts[k]! + ts[k + 1]!) / 2;
      const p: Point = [a[0] + r[0] * m, a[1] + r[1] * m];
      const offset: Point = [(-r[1] / length) * eps, (r[0] / length) * eps];
      if (inside([p[0] + offset[0], p[1] + offset[1]]) && inside([p[0] - offset[0], p[1] - offset[1]])) return true;
    }
  }
  return false;
}
