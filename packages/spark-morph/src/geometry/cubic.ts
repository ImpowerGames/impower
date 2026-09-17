import type { Cubic, Point } from "../types";

export const dist = (p: Point, q: Point): number =>
  Math.hypot(p[0] - q[0], p[1] - q[1]);

export const lerpPoint = (p: Point, q: Point, t: number): Point => [
  p[0] + (q[0] - p[0]) * t,
  p[1] + (q[1] - p[1]) * t,
];

export const copyCubic = (s: Cubic): Cubic => ({
  p0: [s.p0[0], s.p0[1]],
  c1: [s.c1[0], s.c1[1]],
  c2: [s.c2[0], s.c2[1]],
  p1: [s.p1[0], s.p1[1]],
});

export const copyLoop = (loop: Cubic[]): Cubic[] => loop.map(copyCubic);

export const lineCubic = (a: Point, b: Point): Cubic => ({
  p0: [a[0], a[1]],
  c1: [a[0], a[1]],
  c2: [b[0], b[1]],
  p1: [b[0], b[1]],
});

/** A closed polyline as straight cubics, one per edge. */
export const polylineLoop = (pts: Point[]): Cubic[] =>
  pts.map((p, i) => lineCubic(p, pts[(i + 1) % pts.length]!));

/**
 * Whether a segment is straight: both handles sit on their endpoints, to a
 * tolerance relative to the segment's own chord so tiny drawings behave
 * like large ones. A zero-length segment counts as a line.
 */
export const isLine = (s: Cubic, relative = 1e-9): boolean => {
  const tol = relative * dist(s.p0, s.p1);
  return dist(s.c1, s.p0) <= tol && dist(s.c2, s.p1) <= tol;
};

/**
 * The loop without zero-length segments (a coincident anchor drawn twice),
 * which would otherwise read as a wrap-around when resampling. Segments
 * shorter than `relative` times the loop's extent are dropped; a loop that
 * would lose every segment is returned as is.
 */
export function dropZeroSegments(loop: Cubic[], relative = 1e-9): Cubic[] {
  const tol = relative * loopExtent(loop);
  const kept = loop.filter((s) => !(dist(s.p0, s.p1) <= tol && dist(s.c1, s.p0) <= tol && dist(s.c2, s.p1) <= tol));
  return kept.length ? kept : loop;
}

export function evalCubic(s: Cubic, t: number): Point {
  const u = 1 - t;
  const a = u * u * u,
    b = 3 * u * u * t,
    c = 3 * u * t * t,
    d = t * t * t;
  return [
    a * s.p0[0] + b * s.c1[0] + c * s.c2[0] + d * s.p1[0],
    a * s.p0[1] + b * s.c1[1] + c * s.c2[1] + d * s.p1[1],
  ];
}

/**
 * De Casteljau split at `t`; the two halves trace exactly the original. A
 * straight segment splits into straight segments whose handles sit on
 * their endpoints, so it still reads as a line afterwards.
 */
export function splitCubic(s: Cubic, t: number): [Cubic, Cubic] {
  if (isLine(s)) {
    const m = lerpPoint(s.p0, s.p1, t);
    return [lineCubic(s.p0, m), lineCubic(m, s.p1)];
  }
  const a = lerpPoint(s.p0, s.c1, t),
    b = lerpPoint(s.c1, s.c2, t),
    c = lerpPoint(s.c2, s.p1, t);
  const d = lerpPoint(a, b, t),
    e = lerpPoint(b, c, t);
  const m = lerpPoint(d, e, t);
  return [
    { p0: s.p0, c1: a, c2: d, p1: m },
    { p0: m, c1: e, c2: c, p1: s.p1 },
  ];
}

/** The exact sub-cubic over the local parameter range `[t0, t1]`. */
export function subCubic(seg: Cubic, t0: number, t1: number): Cubic {
  const right = t0 <= 1e-9 ? seg : splitCubic(seg, t0)[1];
  const t1b = t1 >= 1 - 1e-9 ? 1 : (t1 - t0) / (1 - t0);
  return t1b >= 1 - 1e-9 ? right : splitCubic(right, t1b)[0];
}

/** Arc length by chordal integration with `steps` samples. */
export function segLength(s: Cubic, steps = 24): number {
  if (isLine(s)) return dist(s.p0, s.p1);
  let len = 0,
    prev = s.p0;
  for (let i = 1; i <= steps; i++) {
    const p = evalCubic(s, i / steps);
    len += dist(p, prev);
    prev = p;
  }
  return len;
}

/** The local `t` at which the segment has covered `frac` of its arc length. */
export function tForFraction(s: Cubic, frac: number, steps = 32): number {
  if (isLine(s)) return Math.max(0, Math.min(1, frac));
  const target = frac * segLength(s, steps);
  let len = 0,
    prev = s.p0;
  for (let i = 1; i <= steps; i++) {
    const p = evalCubic(s, i / steps);
    const d = dist(p, prev);
    if (len + d >= target) return d === 0 ? (i - 1) / steps : (i - 1 + (target - len) / d) / steps;
    len += d;
    prev = p;
  }
  return 1;
}

export const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

/**
 * A closed loop parameterised by normalised cumulative arc length, so the
 * point at fraction `f` (cyclic) can be evaluated exactly on the source curve.
 */
export class ArcLoop {
  readonly loop: Cubic[];
  readonly lengths: number[];
  readonly total: number;
  /** Start fraction of each segment, plus a trailing 1. */
  readonly starts: number[];

  constructor(loop: Cubic[]) {
    this.loop = loop;
    this.lengths = loop.map((s) => segLength(s));
    const total = this.lengths.reduce((a, b) => a + b, 0);
    this.total = total || 1;
    const starts: number[] = [];
    let acc = 0;
    for (let i = 0; i < loop.length; i++) {
      starts.push(acc / this.total);
      acc += this.lengths[i]!;
    }
    starts.push(1);
    this.starts = starts;
  }

  /** Index of the segment containing cyclic fraction `f`. */
  segmentAt(f: number): number {
    const m = ((f % 1) + 1) % 1;
    for (let i = 0; i < this.loop.length; i++) {
      if (m >= this.starts[i]! - 1e-9 && m < this.starts[i + 1]! - 1e-9) return i;
    }
    return this.loop.length - 1;
  }

  pointAt(f: number): Point {
    const m = ((f % 1) + 1) % 1;
    const si = this.segmentAt(f);
    const s0 = this.starts[si]!,
      s1 = this.starts[si + 1]!;
    const frac = (m - s0) / (s1 - s0 || 1);
    return evalCubic(this.loop[si]!, tForFraction(this.loop[si]!, clamp01(frac)));
  }

  /** Unit direction of travel at fraction `f`, from a small forward step. */
  directionAt(f: number, step = 0.002): Point {
    const a = this.pointAt(f),
      b = this.pointAt(f + step);
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      len = Math.hypot(dx, dy) || 1;
    return [dx / len, dy / len];
  }
}

/**
 * Signed area of a closed loop with each curve flattened, so a loop of few
 * long curves (a two-segment lash) still reports its true area and winding.
 */
export function signedArea(loop: Cubic[]): number {
  let a = 0;
  for (const c of loop) {
    const pts = flattenCubic(c, 32);
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i]!,
        q = pts[i + 1]!;
      a += p[0] * q[1] - q[0] * p[1];
    }
  }
  return a / 2;
}

export function polygonArea(pts: Point[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!,
      q = pts[(i + 1) % pts.length]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

export function reverseLoop(loop: Cubic[]): Cubic[] {
  return loop
    .slice()
    .reverse()
    .map((s) => ({ p0: s.p1, c1: s.c2, c2: s.c1, p1: s.p0 }));
}

export const rotateLoop = (loop: Cubic[], k: number): Cubic[] =>
  loop.slice(k).concat(loop.slice(0, k));

/** Appends a straight closing segment when the loop's ends do not meet. */
export function closeLoop(loop: Cubic[], eps = 1e-6): Cubic[] {
  const f = loop[0]!.p0,
    l = loop[loop.length - 1]!.p1;
  if (dist(f, l) > eps) return [...loop, lineCubic(l, f)];
  return loop;
}

/**
 * Snaps a nearly closed loop's last endpoint onto its first when they are
 * within `tol`, the manual "close path" cleanup for seam drift.
 */
export function snapClosed(loop: Cubic[], tol = 3): Cubic[] {
  const out = copyLoop(loop);
  const n = out.length;
  const f = out[0]!.p0;
  if (dist(out[n - 1]!.p1, f) < tol) out[n - 1]!.p1 = [f[0], f[1]];
  return out;
}

/** The mean of segment start points: the collapse centre used by `scale`. */
export function anchorMean(loop: Cubic[]): Point {
  let x = 0,
    y = 0;
  for (const s of loop) {
    x += s.p0[0];
    y += s.p0[1];
  }
  const n = loop.length || 1;
  return [x / n, y / n];
}

export function lerpLoops(a: Cubic[], b: Cubic[], t: number): Cubic[] {
  return a.map((s, i) => {
    const o = b[i]!;
    return {
      p0: lerpPoint(s.p0, o.p0, t),
      c1: lerpPoint(s.c1, o.c1, t),
      c2: lerpPoint(s.c2, o.c2, t),
      p1: lerpPoint(s.p1, o.p1, t),
    };
  });
}

export function flattenCubic(c: Cubic, n = 8): Point[] {
  if (isLine(c)) return [c.p0, c.p1];
  const out: Point[] = [];
  for (let i = 0; i <= n; i++) out.push(evalCubic(c, i / n));
  return out;
}

/**
 * Whether two segments cross strictly inside both. Parallel segments are
 * judged relative to the segments' lengths, so the test is scale-free.
 */
export function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const dx1 = b[0] - a[0],
    dy1 = b[1] - a[1],
    dx2 = d[0] - c[0],
    dy2 = d[1] - c[1],
    den = dx1 * dy2 - dy1 * dx2;
  const scale = Math.hypot(dx1, dy1) * Math.hypot(dx2, dy2);
  if (scale === 0 || Math.abs(den) < 1e-12 * scale) return false;
  const t = ((c[0] - a[0]) * dy2 - (c[1] - a[1]) * dx2) / den,
    u = ((c[0] - a[0]) * dy1 - (c[1] - a[1]) * dx1) / den;
  return t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6;
}

/**
 * Whether a closed loop crosses itself. The whole loop is flattened into
 * one polyline (eight chords per curve), so two adjacent curves that meet
 * at an anchor and cross elsewhere are caught, and so is a loop of only
 * one or two curves; only consecutive chords, which share a point, are
 * skipped.
 */
export function selfIntersects(loop: Cubic[]): boolean {
  if (loop.length < 1) return false;
  const pts: Point[] = [];
  for (const c of loop) {
    const flat = flattenCubic(c);
    for (let i = 0; i < flat.length - 1; i++) pts.push(flat[i]!);
  }
  return polygonSelfIntersects(pts);
}

/** Whether a single curve loops through itself (a knot), judged on chords. */
export function cubicKnots(c: Cubic, n = 16): boolean {
  const pts = flattenCubic(c, n);
  for (let i = 0; i < pts.length - 1; i++) {
    for (let j = i + 2; j < pts.length - 1; j++) {
      if (segmentsCross(pts[i]!, pts[i + 1]!, pts[j]!, pts[j + 1]!)) return true;
    }
  }
  return false;
}

/** Whether a closed polyline crosses itself (non-adjacent edges only). */
export function polygonSelfIntersects(pts: Point[]): boolean {
  const n = pts.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segmentsCross(pts[i]!, pts[(i + 1) % n]!, pts[j]!, pts[(j + 1) % n]!)) return true;
    }
  }
  return false;
}

/**
 * Whether two loops are the same drawing within `eps` per control point. A
 * still drawing must be detected before any resampling touches it.
 */
export function sameLoop(a: Cubic[], b: Cubic[], eps = 1.2): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const s = a[i]!,
      o = b[i]!;
    if (dist(s.p0, o.p0) > eps || dist(s.c1, o.c1) > eps || dist(s.c2, o.c2) > eps || dist(s.p1, o.p1) > eps) {
      return false;
    }
  }
  return true;
}

/** The loop reversed if needed so its signed area has the sign of `wind`. */
export function withWinding(loop: Cubic[], wind: number): Cubic[] {
  return Math.sign(signedArea(loop) || 1) !== Math.sign(wind || 1) ? reverseLoop(loop) : loop;
}

/** Evenly spaced points by arc length, `n` of them, starting at fraction `f0`. */
export function loopToPolyline(loop: Cubic[], n: number, f0 = 0): Point[] {
  const arc = new ArcLoop(loop);
  const out: Point[] = [];
  for (let i = 0; i < n; i++) out.push(arc.pointAt(f0 + i / n));
  return out;
}

/** `n` points evenly spaced by arc length along an open chain, ends included. */
export function chainToPolyline(chain: Cubic[], n: number): Point[] {
  const lengths = chain.map((s) => segLength(s));
  const total = lengths.reduce((a, b) => a + b, 0) || 1;
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    const target = (i / (n - 1)) * total;
    let acc = 0,
      si = chain.length - 1;
    for (let k = 0; k < chain.length; k++) {
      if (target <= acc + lengths[k]! || k === chain.length - 1) {
        si = k;
        break;
      }
      acc += lengths[k]!;
    }
    const frac = clamp01((target - acc) / (lengths[si] || 1));
    out.push(evalCubic(chain[si]!, tForFraction(chain[si]!, frac)));
  }
  return out;
}

/**
 * Interpolates handles in tangent space: each handle's direction rotates
 * the short way while its length blends linearly. Two collinear handles at
 * a smooth anchor stay collinear at every progress, so the anchor never
 * kinks mid-morph. Degenerate (zero-length) handles blend as offsets.
 */
export function lerpLoopsAngular(a: Cubic[], b: Cubic[], t: number): Cubic[] {
  const n = a.length;
  const wrapAngle = (d: number) => {
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d <= -Math.PI) d += 2 * Math.PI;
    return d;
  };
  const out: Cubic[] = a.map((s, i) => {
    const o = b[i]!;
    return { p0: lerpPoint(s.p0, o.p0, t), c1: [0, 0], c2: [0, 0], p1: lerpPoint(s.p1, o.p1, t) };
  });
  // Both handles of a node resolve a 180-degree tie the same way because
  // `wrapAngle` maps the tie to +PI whichever side it is reached from, so
  // a smooth node turning exactly half a circle keeps its handles collinear
  // instead of each handle choosing an opposite direction.
  for (let i = 0; i < n; i++) {
    const prev = (i - 1 + n) % n;
    const P = out[i]!.p0;
    const rot = (anA: Point, cA: Point, anB: Point, cB: Point): Point => {
      const hax = cA[0] - anA[0],
        hay = cA[1] - anA[1],
        hbx = cB[0] - anB[0],
        hby = cB[1] - anB[1];
      const la = Math.hypot(hax, hay),
        lb = Math.hypot(hbx, hby),
        len = la + (lb - la) * t;
      const scale = Math.max(la, lb);
      if (la <= 1e-9 * scale || lb <= 1e-9 * scale || scale === 0) {
        return [P[0] + hax + (hbx - hax) * t, P[1] + hay + (hby - hay) * t];
      }
      const angA = Math.atan2(hay, hax);
      const d = wrapAngle(Math.atan2(hby, hbx) - angA);
      const ang = angA + d * t;
      return [P[0] + Math.cos(ang) * len, P[1] + Math.sin(ang) * len];
    };
    out[i]!.c1 = rot(a[i]!.p0, a[i]!.c1, b[i]!.p0, b[i]!.c1);
    out[prev]!.c2 = rot(a[prev]!.p1, a[prev]!.c2, b[prev]!.p1, b[prev]!.c2);
  }
  return out;
}

/** The larger side of the control-point bounding box: the drawing's size. */
export function loopExtent(loop: Cubic[]): number {
  let xmin = Infinity,
    ymin = Infinity,
    xmax = -Infinity,
    ymax = -Infinity;
  for (const c of loop) {
    for (const p of [c.p0, c.c1, c.c2, c.p1]) {
      if (p[0] < xmin) xmin = p[0];
      if (p[0] > xmax) xmax = p[0];
      if (p[1] < ymin) ymin = p[1];
      if (p[1] > ymax) ymax = p[1];
    }
  }
  return loop.length ? Math.max(xmax - xmin, ymax - ymin) : 0;
}

/** Whether the segment list ends where it starts, within `tol`. */
export function endsMeet(segments: Cubic[], tol: number): boolean {
  if (!segments.length) return false;
  return dist(segments[0]!.p0, segments[segments.length - 1]!.p1) <= tol;
}

/** Normalised arc-length fraction at which each segment starts. */
export function anchorFractions(loop: Cubic[]): number[] {
  return new ArcLoop(loop).starts.slice(0, loop.length);
}

/**
 * Resamples a closed loop so its anchors sit at `fractions` (cyclic order,
 * in [0, 1)). Every original anchor fraction must be present so each
 * interval lies within one original segment and comes out as an exact
 * sub-cubic: a straight segment stays straight and a curve keeps its shape.
 */
export function resampleAtFractions(loop: Cubic[], fractions: number[]): Cubic[] {
  const arc = new ArcLoop(loop);
  const out: Cubic[] = [];
  const wrap = (u: number) => ((u % 1) + 1) % 1;
  for (let k = 0; k < fractions.length; k++) {
    const a0 = fractions[k]!;
    let a1 = fractions[(k + 1) % fractions.length]!;
    // Two equal fractions are a zero-length interval (a coincident
    // anchor), not a trip around the loop; only a genuine decrease wraps.
    if (Math.abs(a1 - a0) <= 1e-12) {
      const p = arc.pointAt(a0);
      out.push(lineCubic(p, p));
      continue;
    }
    if (a1 < a0) a1 += 1;
    const si = arc.segmentAt((a0 + a1) / 2);
    const s0 = arc.starts[si]!,
      s1 = arc.starts[si + 1]!;
    const f0 = clamp01((wrap(a0) - s0) / (s1 - s0 || 1));
    let a1m = a1 % 1;
    if (a1m < 1e-9) a1m = 1;
    const f1 = clamp01((a1m - s0) / (s1 - s0 || 1));
    const seg = loop[si]!;
    out.push(subCubic(seg, tForFraction(seg, f0), tForFraction(seg, f1 < f0 ? 1 : f1)));
  }
  return out;
}

/**
 * Least-squares fit of one cubic through `pts` with fixed end tangents
 * `t0` (leaving the first point) and `t3` (arriving at the last point,
 * pointing back along the curve). Handle lengths are clamped to the chord so
 * the fit never bows out past a tapered tip.
 */
export function fitCubic(pts: Point[], t0: Point, t3: Point): { c1: Point; c2: Point } {
  const P0 = pts[0]!,
    P3 = pts[pts.length - 1]!;
  const u: number[] = [0];
  for (let i = 1; i < pts.length; i++) u.push(u[i - 1]! + dist(pts[i]!, pts[i - 1]!));
  const tot = u[u.length - 1] || 1;
  for (let i = 0; i < u.length; i++) u[i] = u[i]! / tot;
  let c11 = 0,
    c12 = 0,
    c22 = 0,
    x1 = 0,
    x2 = 0;
  for (let i = 0; i < pts.length; i++) {
    const ui = u[i]!,
      b0 = (1 - ui) ** 3,
      b1 = 3 * (1 - ui) ** 2 * ui,
      b2 = 3 * (1 - ui) * ui * ui,
      b3 = ui ** 3;
    const a1x = t0[0] * b1,
      a1y = t0[1] * b1,
      a2x = t3[0] * b2,
      a2y = t3[1] * b2;
    c11 += a1x * a1x + a1y * a1y;
    c12 += a1x * a2x + a1y * a2y;
    c22 += a2x * a2x + a2y * a2y;
    const tx = pts[i]![0] - (P0[0] * (b0 + b1) + P3[0] * (b2 + b3)),
      ty = pts[i]![1] - (P0[1] * (b0 + b1) + P3[1] * (b2 + b3));
    x1 += a1x * tx + a1y * ty;
    x2 += a2x * tx + a2y * ty;
  }
  const det = c11 * c22 - c12 * c12,
    chord = dist(P0, P3);
  let al1 = Math.abs(det) > 1e-9 ? (x1 * c22 - x2 * c12) / det : chord / 3;
  let al3 = Math.abs(det) > 1e-9 ? (c11 * x2 - c12 * x1) / det : chord / 3;
  const cap = chord * 0.9;
  al1 = Math.min(Math.max(al1, chord * 0.06), cap);
  al3 = Math.min(Math.max(al3, chord * 0.06), cap);
  return {
    c1: [P0[0] + t0[0] * al1, P0[1] + t0[1] * al1],
    c2: [P3[0] + t3[0] * al3, P3[1] + t3[1] * al3],
  };
}
