import { clamp01, dist, evalCubic, isLine, polygonArea } from "./geometry/cubic";
import type { BendTrack } from "./methods/bend";
import type { Point } from "./types";

export interface EdgeTrack {
  id: string;
  label: string;
  track: BendTrack;
}

export interface Aperture {
  edgeIds: [string, string];
  loop(progress: number): Point[];
  area(progress: number): number;
  bands(progress: number): [Point[], Point[]];
}

export type ApertureDiagnosticCode = "unpaired-edge" | "ambiguous" | "degenerate-edge";

export interface ApertureDiagnostic {
  code: ApertureDiagnosticCode;
  edgeIds: string[];
  message: string;
}

export interface ApertureResult {
  apertures: Aperture[];
  diagnostics: ApertureDiagnostic[];
}

export interface ApertureOptions {
  points?: number;
  tipTolerance?: number;
  tipToleranceMin?: number;
}

const pointsExtent = (pts: Point[]): number => {
  let xmin = Infinity,
    ymin = Infinity,
    xmax = -Infinity,
    ymax = -Infinity;
  for (const p of pts) {
    if (p[0] < xmin) xmin = p[0];
    if (p[0] > xmax) xmax = p[0];
    if (p[1] < ymin) ymin = p[1];
    if (p[1] > ymax) ymax = p[1];
  }
  return pts.length ? Math.max(xmax - xmin, ymax - ymin) : 0;
};

const mean = (pts: Point[]): Point => {
  let x = 0,
    y = 0;
  for (const p of pts) {
    x += p[0];
    y += p[1];
  }
  const n = pts.length || 1;
  return [x / n, y / n];
};

export function buildApertures(edges: EdgeTrack[], options: ApertureOptions = {}): ApertureResult {
  const points = Math.max(4, options.points ?? 24);
  const tolFrac = options.tipTolerance ?? 0.2;
  const poses = [0, 1].map((t) => {
    const tips = edges.map((e) => e.track.tips(t));
    return { tips, spans: tips.map(([a, b]) => dist(a, b)) };
  });
  const spans = poses[0]!.spans;
  const diagnostics: ApertureDiagnostic[] = [];
  const degenerate = new Set<number>();
  edges.forEach((e, i) => {
    if (!(spans[i]! > 0)) {
      degenerate.add(i);
      diagnostics.push({ code: "degenerate-edge", edgeIds: [e.id], message: `edge "${e.id}" (${e.label}) has coincident tips and no span` });
    }
  });
  const meeting = (i: number, j: number): { crossed: boolean } | false => {
    if (degenerate.has(i) || degenerate.has(j)) return false;
    for (const { tips, spans } of poses) {
      const span = Math.min(spans[i]!, spans[j]!);
      if (!(span > 0)) continue;
      const [a1, a2] = tips[i]!,
        [b1, b2] = tips[j]!;
      const tol = Math.max(options.tipToleranceMin ?? 0.04 * span, tolFrac * span);
      const straight = dist(a1, b1) <= tol && dist(a2, b2) <= tol;
      const crossed = dist(a1, b2) <= tol && dist(a2, b1) <= tol;
      if (straight || crossed) return { crossed: dist(a1, b2) < dist(a1, b1) };
    }
    return false;
  };
  const seen = new Set<number>(degenerate);
  const groups: number[][] = [];
  for (let i = 0; i < edges.length; i++) {
    if (seen.has(i)) continue;
    const group = [i];
    seen.add(i);
    for (let k = 0; k < group.length; k++) {
      for (let j = 0; j < edges.length; j++) {
        if (!seen.has(j) && meeting(group[k]!, j)) {
          seen.add(j);
          group.push(j);
        }
      }
    }
    groups.push(group);
  }
  const apertures: Aperture[] = [];
  for (const group of groups) {
    if (group.length === 1) {
      const e = edges[group[0]!]!;
      diagnostics.push({ code: "unpaired-edge", edgeIds: [e.id], message: `edge "${e.id}" (${e.label}) has no facing edge with adjacent tips` });
      continue;
    }
    if (group.length > 2) {
      const ids = group.map((g) => edges[g]!.id);
      diagnostics.push({
        code: "ambiguous",
        edgeIds: ids,
        message: `edges ${ids.map((id) => `"${id}"`).join(", ")} share tips; an aperture needs exactly two facing edges`,
      });
      continue;
    }
    const [i, j] = group as [number, number];
    apertures.push(makeAperture(edges[i]!, edges[j]!, (meeting(i, j) as { crossed: boolean }).crossed, points));
  }
  return { apertures, diagnostics };
}

const AT_END = 1e-9;

function firstCrossing(pts: Point[], throughPoints = false): { i: number; j: number; x: Point } | undefined {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i]!,
      p2 = pts[(i + 1) % n]!;
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const q = pts[j]!,
        q2 = pts[(j + 1) % n]!;
      const rx = p2[0] - p[0],
        ry = p2[1] - p[1],
        sx = q2[0] - q[0],
        sy = q2[1] - q[1],
        den = rx * sy - ry * sx;
      if (den === 0) continue;
      const wx = q[0] - p[0],
        wy = q[1] - p[1];
      const t = (wx * sy - wy * sx) / den,
        u = (wx * ry - wy * rx) / den;
      if (t < -AT_END || t > 1 + AT_END || u < -AT_END || u > 1 + AT_END) continue;
      const tEnd = t <= AT_END ? i : t >= 1 - AT_END ? (i + 1) % n : -1,
        uEnd = u <= AT_END ? j : u >= 1 - AT_END ? (j + 1) % n : -1;
      if (tEnd < 0 && uEnd < 0) return { i, j, x: [p[0] + t * rx, p[1] + t * ry] };
      if (!throughPoints) continue;
      const crossed = tEnd >= 0 && uEnd >= 0 ? runsInterleave(pts, tEnd, uEnd) : tEnd >= 0 ? passesThrough(pts, tEnd, q, q2) : passesThrough(pts, uEnd, p, p2);
      if (crossed) return { i, j, x: pts[tEnd >= 0 ? tEnd : uEnd]! };
    }
  }
  return undefined;
}

function neighbours(pts: Point[], k: number): [Point, Point] | undefined {
  const n = pts.length,
    v = pts[k]!;
  const away = (step: number) => {
    for (let s = 1; s < n; s++) {
      const p = pts[(k + step * s + n * s) % n]!;
      if (p[0] !== v[0] || p[1] !== v[1]) return p;
    }
    return undefined;
  };
  const before = away(-1),
    after = away(1);
  return before && after ? [before, after] : undefined;
}

function side(a: Point, b: Point, q: Point): number {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    ox = q[0] - a[0],
    oy = q[1] - a[1];
  const cross = dx * oy - dy * ox;
  return Math.abs(cross) <= AT_END * Math.hypot(dx, dy) * Math.hypot(ox, oy) ? 0 : Math.sign(cross);
}

function passesThrough(pts: Point[], k: number, a: Point, b: Point): boolean {
  const around = neighbours(pts, k);
  return !!around && side(a, b, around[0]) * side(a, b, around[1]) < 0;
}

function runsInterleave(pts: Point[], k: number, m: number): boolean {
  const a = neighbours(pts, k),
    b = neighbours(pts, m);
  if (!a || !b) return false;
  const v = pts[k]!;
  const angle = (p: Point) => Math.atan2(p[1] - v[1], p[0] - v[0]);
  const turn = (from: number, to: number) => (((to - from) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const start = angle(a[0]!),
    span = turn(start, angle(a[1]!));
  const within = (p: Point) => {
    const at = turn(start, angle(p));
    return at <= AT_END || Math.abs(at - span) <= AT_END ? undefined : at < span;
  };
  const first = within(b[0]!),
    second = within(b[1]!);
  return first !== undefined && second !== undefined && first !== second;
}

export function untangle(loop: Point[], sign: number, options: { snap?: (p: Point) => Point; throughPoints?: boolean } = {}): Point[] {
  const { snap = (p: Point) => p, throughPoints = false } = options;
  let pts = loop;
  for (let hit = firstCrossing(pts, throughPoints); hit && pts.length >= 3; hit = firstCrossing(pts, throughPoints)) {
    const { i, j } = hit;
    const x = snap(hit.x);
    const inner = [x, ...pts.slice(i + 1, j + 1)];
    const outer = [...pts.slice(0, i + 1), x, ...pts.slice(j + 1)];
    const ai = polygonArea(inner),
      ao = polygonArea(outer);
    const innerRight = Math.sign(ai) === sign,
      outerRight = Math.sign(ao) === sign;
    pts = innerRight !== outerRight ? (innerRight ? inner : outer) : Math.abs(ai) >= Math.abs(ao) ? inner : outer;
  }
  return pts;
}

function sideOf(line: Point[], q: Point): number | undefined {
  let best = Infinity,
    side: number | undefined;
  const last = line.length - 2;
  for (let k = 0; k <= last; k++) {
    const s = line[k]!,
      e = line[k + 1]!;
    const dx = e[0] - s[0],
      dy = e[1] - s[1],
      len2 = dx * dx + dy * dy;
    if (!(len2 > 0)) continue;
    const raw = ((q[0] - s[0]) * dx + (q[1] - s[1]) * dy) / len2;
    const u = clamp01(raw);
    const ox = q[0] - (s[0] + u * dx),
      oy = q[1] - (s[1] + u * dy),
      d = ox * ox + oy * oy;
    if (d < best) {
      best = d;
      side = (k === 0 && raw < 0) || (k === last && raw > 1) ? undefined : dx * oy - dy * ox;
    }
  }
  return side;
}

function corner(p: Point, q: Point, facing: number, extent: number, restGap: number): Point[] {
  const dx = q[0] - p[0],
    dy = q[1] - p[1],
    g = Math.hypot(dx, dy);
  if (!(g > 1e-6 * extent)) return [];
  const depth = restGap > 0 ? Math.min(g, restGap) * Math.min(1, g / restGap) ** 2 : 0;
  if (!(depth > 0)) return [];
  const k = depth / g;
  const ox = facing * dy * k,
    oy = -facing * dx * k;
  return [
    [p[0] + ox, p[1] + oy],
    [q[0] + ox, q[1] + oy],
  ];
}

const BAND_STEPS = 8;

function makeAperture(A: EdgeTrack, B: EdgeTrack, flipB: boolean, points: number): Aperture {
  let facingA = 0,
    facingB = 0,
    farthest = -1;
  for (let k = 0; k <= 10; k++) {
    const t = k / 10;
    const ea = A.track.edges(t, points),
      eb = B.track.edges(t, points);
    const mA = mean([...ea[0], ...ea[1]]),
      mB = mean([...eb[0], ...eb[1]]);
    const gap = dist(mA, mB);
    if (gap > farthest) {
      farthest = gap;
      facingA = dist(mean(ea[0]), mB) <= dist(mean(ea[1]), mB) ? 0 : 1;
      facingB = dist(mean(eb[0]), mA) <= dist(mean(eb[1]), mA) ? 0 : 1;
    }
  }
  const ribs = (t: number) => {
    const ea = A.track.edges(t, points),
      eb = B.track.edges(t, points);
    const a = ea[facingA]!;
    let b = eb[facingB]!;
    if (flipB) b = b.slice().reverse();
    const mA = mean([...ea[0], ...ea[1]]),
      mB = mean([...eb[0], ...eb[1]]);
    const ox = mB[0] - mA[0],
      oy = mB[1] - mA[1],
      olen = Math.hypot(ox, oy);
    const extent = pointsExtent([...ea[0], ...ea[1], ...eb[0], ...eb[1]]);
    const closed = extent <= 0 || olen <= 1e-9 * extent;
    const dir: Point = closed ? [0, 0] : [ox / olen, oy / olen];
    const cx = a[points - 1]![0] - a[0]![0],
      cy = a[points - 1]![1] - a[0]![1];
    const facing = Math.sign(cx * dir[1] - cy * dir[0]) || 1;
    const gaps = a.map((p, i) => {
      const q = b[i]!;
      const qSide = sideOf(a, q),
        pSide = sideOf(b, p);
      return closed ? 0 : Math.min(qSide === undefined ? 0 : facing * qSide, pSide === undefined ? 0 : -facing * pSide);
    });
    const open = !closed && gaps.some((gap, i) => i > 0 && i < points - 1 && gap >= 0);
    return { a, b, gaps, open, facing, extent };
  };
  const openRestGaps = [0, 1].map((t) => {
    const { a, b, open } = ribs(t);
    return open ? [dist(a[0]!, b[0]!), dist(a[points - 1]!, b[points - 1]!)] : [0, 0];
  });
  const startGap = Math.max(openRestGaps[0]![0]!, openRestGaps[1]![0]!),
    endGap = Math.max(openRestGaps[0]![1]!, openRestGaps[1]![1]!);
  const loop = (tRaw: number): Point[] => {
    const { a, b, gaps, open, facing, extent } = ribs(clamp01(tRaw));
    const top: Point[] = [],
      bottom: Point[] = [];
    for (let i = 0; i < points; i++) {
      const p = a[i]!,
        q = b[i]!;
      if (open && gaps[i]! >= 0) {
        top.push(p);
        bottom.push(q);
      } else {
        const m: Point = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
        top.push(m);
        bottom.push(m);
      }
    }
    if (!open) return [...top, ...bottom.reverse()];
    const last = points - 1;
    const end = corner(top[last]!, bottom[last]!, facing, extent, endGap);
    const start = corner(bottom[0]!, top[0]!, facing, extent, startGap);
    const untangled = untangle([...top, ...end, ...bottom.reverse(), ...start], facing);
    return untangled.length >= 3 ? untangled : [top[0]!, top[last]!];
  };
  const band = (track: BendTrack, t: number): Point[] => {
    const steps = track.from.map((segment) => (isLine(segment) ? 1 : BAND_STEPS));
    return track.frame(clamp01(t)).flatMap((segment, k) => {
      const n = steps[k] ?? BAND_STEPS;
      return Array.from({ length: n }, (_, i) => evalCubic(segment, i / n));
    });
  };
  return {
    edgeIds: [A.id, B.id],
    loop,
    area: (t) => Math.abs(polygonArea(loop(t))),
    bands: (t) => [band(A.track, t), band(B.track, t)],
  };
}
