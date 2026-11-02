import { isLine, splitCubic } from "@impower/spark-morph/src/geometry/cubic";
import { parsePathData, type Point, type Subpath } from "@impower/spark-morph/src/index";

type Cubic = Subpath["segments"][number];

const TOLERANCE = 1e-4;
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

export function contourOverlapsItself(contour: Subpath, evenodd: boolean): boolean {
  const { segments } = contour;
  if (!segments.length) return false;
  const xs = segments.flatMap((c) => [c.p0[0], c.c1[0], c.c2[0], c.p1[0]]);
  const ys = segments.flatMap((c) => [c.p0[1], c.c1[1], c.c2[1], c.p1[1]]);
  const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  if (!(size > 0)) return false;
  const tolerance = size * TOLERANCE;
  const points: Point[] = [];
  for (const c of segments) flattenInto(c, tolerance / 4, points);
  points.push(segments[segments.length - 1]!.p1);
  return polygonOverlapsItself(
    points.filter((p, i) => !same(p, points[(i + 1) % points.length]!)),
    evenodd,
    tolerance,
  );
}

const cross = (a: Point, b: Point) => a[0] * b[1] - a[1] * b[0];
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1];
const minus = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];

const between = (k: number, c: number, x0: number, lo: number, hi: number): [number, number] => {
  if (k === 0) return c > lo && c < hi ? [-Infinity, Infinity] : [Infinity, -Infinity];
  const s0 = x0 + (lo - c) / k;
  const s1 = x0 + (hi - c) / k;
  return k > 0 ? [s0, s1] : [s1, s0];
};

function nearSpan(a: Point, b: Point, radius: number): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  const take = (s0: number, s1: number) => {
    if (!(s0 < s1)) return;
    lo = Math.min(lo, s0);
    hi = Math.max(hi, s1);
  };
  for (const [x, y] of [a, b]) {
    const reach = radius * radius - (radius - y) * (radius - y);
    if (reach > 0) take(x - Math.sqrt(reach), x + Math.sqrt(reach));
  }
  const [dx, dy] = minus(b, a);
  const length = Math.hypot(dx, dy);
  if (length > 0) {
    const across = between(dx, (radius - a[1]) * dy, a[0], 0, length * length);
    const beside = between(-dy / length, (dx * (radius - a[1])) / length, a[0], -radius, radius);
    take(Math.max(across[0], beside[0]), Math.min(across[1], beside[1]));
  }
  return lo < hi ? [lo, hi] : null;
}

function polygonOverlapsItself(points: Point[], evenodd: boolean, tolerance: number): boolean {
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
      const adjacent = j === i + 1 || (i === 0 && j === n - 1);
      if (a.maxY < e.minY || e.maxY < a.minY) continue;
      const [p, q] = edge(i);
      const [c, d] = edge(j);
      const r = minus(q, p);
      const s = minus(d, c);
      const denominator = cross(r, s);
      const cp = minus(c, p);
      const parallel = Math.abs(denominator) <= tiny * Math.hypot(...r) * Math.hypot(...s);
      if (adjacent && !parallel) continue;
      if (parallel) {
        if (Math.abs(cross(cp, r)) > tiny * Math.hypot(...r)) continue;
        const length = r[0] * r[0] + r[1] * r[1];
        const t0 = (cp[0] * r[0] + cp[1] * r[1]) / length;
        const t1 = t0 + (s[0] * r[0] + s[1] * r[1]) / length;
        const from = Math.max(Math.min(t0, t1), 0);
        const to = Math.min(Math.max(t0, t1), 1);
        if (to - from <= 1e-12) continue;
        splits[i]!.push(from, to);
        splits[j]!.push((from - t0) / (t1 - t0), (to - t0) / (t1 - t0));
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
  const winding = ([x, y]: Point): number => {
    let total = 0;
    for (let i = 0; i < n; i++) {
      const [[ax, ay], [bx, by]] = edge(i);
      const side = (bx - ax) * (y - ay) - (x - ax) * (by - ay);
      if (ay <= y) {
        if (by > y && side > 0) total++;
      } else if (by <= y && side < 0) total--;
    }
    return total;
  };
  const filled = (w: number) => (evenodd ? w % 2 !== 0 : w !== 0);
  const eps = size * 1e-7;
  type Piece = { a: Point; b: Point; lo: number; hi: number; deep: number; deepOnLeft: boolean };
  const pieces: Piece[] = [];
  for (let i = 0; i < n; i++) {
    const [a, b] = edge(i);
    const r = minus(b, a);
    const length = Math.hypot(...r);
    const left: Point = [-r[1] / length, r[0] / length];
    const at = (t: number): Point => [a[0] + r[0] * t, a[1] + r[1] * t];
    const ts = [...new Set(splits[i])].sort((x, y) => x - y);
    for (let k = 0; k + 1 < ts.length; k++) {
      if ((ts[k + 1]! - ts[k]!) * length <= eps * 4) continue;
      const p = at((ts[k]! + ts[k + 1]!) / 2);
      const onLeft = winding([p[0] + left[0] * eps, p[1] + left[1] * eps]);
      const onRight = winding([p[0] - left[0] * eps, p[1] - left[1] * eps]);
      const deepOnLeft = Math.abs(onLeft) > Math.abs(onRight);
      pieces.push({ a: at(ts[k]!), b: at(ts[k + 1]!), lo: Math.min(onLeft, onRight), hi: Math.max(onLeft, onRight), deep: deepOnLeft ? onLeft : onRight, deepOnLeft });
    }
  }
  const radius = tolerance / 2;
  const narrow = (piece: Piece): boolean => {
    const r = minus(piece.b, piece.a);
    const length = Math.hypot(...r);
    const along: Point = [r[0] / length, r[1] / length];
    const normal: Point = piece.deepOnLeft ? [-along[1], along[0]] : [along[1], -along[0]];
    const spans: [number, number][] = [];
    for (const other of pieces) {
      if (other === piece || !(piece.deep > 0 ? other.lo < piece.deep && piece.deep <= other.hi : other.lo <= piece.deep && piece.deep < other.hi)) continue;
      const [a, b] = [other.a, other.b].map((p): Point => {
        const v = minus(p, piece.a);
        return [dot(v, along), dot(v, normal)];
      }) as [Point, Point];
      if (Math.max(a[1], b[1]) <= 0 || Math.min(a[1], b[1]) >= 2 * radius) continue;
      if (Math.max(a[0], b[0]) <= -radius || Math.min(a[0], b[0]) >= length + radius) continue;
      const span = nearSpan(a, b, radius);
      if (span && span[0] < length && span[1] > 0) spans.push(span);
    }
    spans.sort((p, q) => p[0] - q[0]);
    let reached = 0;
    for (const [s0, s1] of spans) {
      if (s0 > reached + tiny) return false;
      reached = Math.max(reached, s1);
      if (reached >= length - tiny) return true;
    }
    return false;
  };
  return pieces.some((piece) => piece.hi - piece.lo === 1 && filled(piece.lo) && filled(piece.hi) && !narrow(piece));
}