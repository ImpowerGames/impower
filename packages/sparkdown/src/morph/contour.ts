import type { Point, Subpath } from "@impower/spark-morph/src/index";

type Cubic = Subpath["segments"][number];

const CURVE_STEPS = 16;

const cubicAt = (p0: Point, c1: Point, c2: Point, p1: Point, t: number): Point => {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const d = 3 * u * t * t;
  const e = t * t * t;
  return [a * p0[0] + b * c1[0] + d * c2[0] + e * p1[0], a * p0[1] + b * c1[1] + d * c2[1] + e * p1[1]];
};

const same = (a: Point, b: Point) => a[0] === b[0] && a[1] === b[1];

const isLine = (p0: Point, c1: Point, c2: Point, p1: Point) => same(c1, p0) && same(c2, p1);

function flatten(segments: [Point, Point, Point, Point][]): Point[] {
  const points: Point[] = [];
  for (const [p0, c1, c2, p1] of segments) {
    if (isLine(p0, c1, c2, p1)) points.push(p0);
    else for (let k = 0; k < CURVE_STEPS; k++) points.push(cubicAt(p0, c1, c2, p1, k / CURVE_STEPS));
  }
  const last = segments[segments.length - 1];
  if (last) points.push(last[3]);
  return points.filter((p, i) => !same(p, points[(i + 1) % points.length]!));
}

export function contourPoints(subpath: Subpath): Point[] {
  return flatten(subpath.segments.map((c: Cubic) => [c.p0, c.c1, c.c2, c.p1]));
}

export function pathContours(d: string): Point[][] {
  const contours: Point[][] = [];
  let segments: [Point, Point, Point, Point][] = [];
  let start: Point = [0, 0];
  let at: Point = [0, 0];
  const close = () => {
    if (segments.length) contours.push(flatten(segments));
    segments = [];
  };
  for (const [, command, body] of d.matchAll(/([MLCZ])([^MLCZ]*)/g)) {
    const n = (body!.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? []).map(Number);
    if (command === "M") {
      close();
      start = at = [n[0]!, n[1]!];
    } else if (command === "L") {
      for (let i = 0; i + 1 < n.length; i += 2) {
        const next: Point = [n[i]!, n[i + 1]!];
        segments.push([at, at, next, next]);
        at = next;
      }
    } else if (command === "C") {
      for (let i = 0; i + 5 < n.length; i += 6) {
        const next: Point = [n[i + 4]!, n[i + 5]!];
        segments.push([at, [n[i]!, n[i + 1]!], [n[i + 2]!, n[i + 3]!], next]);
        at = next;
      }
    } else {
      if (!same(at, start)) segments.push([at, at, start, start]);
      at = start;
    }
  }
  close();
  return contours;
}

const cross = (a: Point, b: Point) => a[0] * b[1] - a[1] * b[0];
const minus = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];

export function overlapsItself(points: Point[], evenodd: boolean): boolean {
  const n = points.length;
  if (n < 4) return false;
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  if (!(size > 0)) return false;
  const tiny = size * 1e-12;
  const edge = (i: number): [Point, Point] => [points[i]!, points[(i + 1) % n]!];
  const splits: number[][] = points.map(() => [0, 1]);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      const [a, b] = edge(i);
      const [c, d] = edge(j);
      const r = minus(b, a);
      const s = minus(d, c);
      const denominator = cross(r, s);
      const ca = minus(c, a);
      if (Math.abs(denominator) <= tiny * Math.hypot(...r) * Math.hypot(...s)) {
        if (Math.abs(cross(ca, r)) > tiny * Math.hypot(...r)) continue;
        const length = r[0] * r[0] + r[1] * r[1];
        const t0 = (ca[0] * r[0] + ca[1] * r[1]) / length;
        const t1 = t0 + (s[0] * r[0] + s[1] * r[1]) / length;
        if (Math.min(Math.max(t0, t1), 1) - Math.max(Math.min(t0, t1), 0) > 1e-12) return true;
        continue;
      }
      const t = cross(ca, s) / denominator;
      const u = cross(ca, r) / denominator;
      if (t < 0 || t > 1 || u < 0 || u > 1) continue;
      splits[i]!.push(t);
      splits[j]!.push(u);
    }
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
