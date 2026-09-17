import {
  closeLoop,
  loopToPolyline,
  polygonSelfIntersects,
  polylineLoop,
  signedArea,
  withWinding,
  clamp01,
} from "../geometry/cubic";
import type { Cubic, MorphFailure, Point, SubpathTrack } from "../types";

export interface ShapeOptions {
  /** Points each outline is resampled to, evenly by arc length. */
  samples?: number;
  /**
   * `uniform` (the default) pairs point i with point i after the best
   * rotation. `warp` refines that with a banded dynamic-time-warping
   * alignment that may pair one point with several so features line up; it
   * is opt-in because a low `warpPenalty` creases a feature emerging from a
   * straight edge, and a high one reproduces the uniform pairing.
   */
  correspondence?: "uniform" | "warp";
  /** Half-width of the warp band as a fraction of the sample count. */
  warpBand?: number;
  /** Cost of duplicating a point, in units of the mean edge length squared. */
  warpPenalty?: number;
  /** Progress values at which self-intersection is checked. */
  checkProgress?: number[];
}

export const SHAPE_DEFAULTS: Required<ShapeOptions> = {
  samples: 64,
  correspondence: "uniform",
  warpBand: 0.125,
  warpPenalty: 4,
  checkProgress: [0.25, 0.5, 0.75],
};

const sq = (p: Point, q: Point): number => {
  const dx = p[0] - q[0],
    dy = p[1] - q[1];
  return dx * dx + dy * dy;
};

const rotated = (pts: Point[], k: number): Point[] => pts.slice(k).concat(pts.slice(0, k));

/** Summed squared travel of the uniform pairing after rotating `b` by `k`. */
function uniformTravel(a: Point[], b: Point[], k: number): number {
  let e = 0;
  const n = a.length;
  for (let i = 0; i < n; i++) e += sq(a[i]!, b[(i + k) % n]!);
  return e;
}

/**
 * Banded dynamic time warping between two equal-length cyclic sequences
 * already rotated into phase. Returns the matched index pairs from (0, 0)
 * to (n - 1, n - 1); a step that advances only one side duplicates a point
 * on the other, which costs the squared distance plus `skipPenalty`.
 */
function warpAlign(a: Point[], b: Point[], band: number, skipPenalty: number): [number, number][] {
  const n = a.length;
  const INF = Number.POSITIVE_INFINITY;
  const cost = new Float64Array(n * n).fill(INF);
  const step = new Int8Array(n * n);
  const idx = (i: number, j: number) => i * n + j;
  cost[0] = sq(a[0]!, b[0]!);
  for (let i = 0; i < n; i++) {
    const jLo = Math.max(0, i - band),
      jHi = Math.min(n - 1, i + band);
    for (let j = jLo; j <= jHi; j++) {
      if (i === 0 && j === 0) continue;
      const d = sq(a[i]!, b[j]!);
      let best = INF,
        from = 0;
      if (i > 0 && j > 0) {
        const c = cost[idx(i - 1, j - 1)]! + d;
        if (c < best) {
          best = c;
          from = 1;
        }
      }
      if (i > 0) {
        const c = cost[idx(i - 1, j)]! + d + skipPenalty;
        if (c < best) {
          best = c;
          from = 2;
        }
      }
      if (j > 0) {
        const c = cost[idx(i, j - 1)]! + d + skipPenalty;
        if (c < best) {
          best = c;
          from = 3;
        }
      }
      cost[idx(i, j)] = best;
      step[idx(i, j)] = from;
    }
  }
  const path: [number, number][] = [];
  let i = n - 1,
    j = n - 1;
  while (i > 0 || j > 0) {
    path.push([i, j]);
    const s = step[idx(i, j)];
    if (s === 1) {
      i--;
      j--;
    } else if (s === 2) i--;
    else j--;
  }
  path.push([0, 0]);
  return path.reverse();
}

/**
 * Turns a warp path's repeated indices into points spread evenly along the
 * outline between the repeated point and the next one, instead of a stack
 * of identical points. A stacked run is a zero-length edge that opens into
 * the other shape's feature and reads as a notch; a spread run starts as a
 * straight stretch of the outline and grows into the feature smoothly.
 */
function spreadRuns(indices: number[], ring: Point[]): Point[] {
  const n = ring.length;
  const out: Point[] = [];
  let k = 0;
  while (k < indices.length) {
    const i = indices[k]!;
    let run = 1;
    while (k + run < indices.length && indices[k + run] === i) run++;
    const a = ring[i]!,
      b = ring[(i + 1) % n]!;
    for (let m = 0; m < run; m++) {
      const f = m / run;
      out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
    }
    k += run;
  }
  return out;
}

export interface ShapeTrack extends SubpathTrack {
  /** The corresponded endpoint polylines; frames interpolate these. */
  fromPoints: Point[];
  toPoints: Point[];
  /** Whether the target loop was reversed to match the source winding. */
  reversed: boolean;
  /** The chosen rotation of the target sample ring. */
  rotation: number;
}

export type ShapeResult = { ok: true; track: ShapeTrack } | { ok: false; failure: MorphFailure };

/**
 * Builds a general closed-loop track between two authored loops, or reports
 * why it cannot. Both loops are closed if open, given the source winding,
 * resampled evenly by arc length, and paired by the rotation with the least
 * summed squared travel over both windings; the optional warp refinement
 * realigns that pairing within a band. Frames are polylines.
 */
export function shapeTrack(fromRaw: Cubic[], toRaw: Cubic[], options: ShapeOptions = {}): ShapeResult {
  const o = { ...SHAPE_DEFAULTS, ...options };
  const n = Math.max(8, Math.round(o.samples));
  const from = closeLoop(fromRaw),
    to = closeLoop(toRaw);
  const A = loopToPolyline(from, n);
  const cands: { pts: Point[]; opposite: boolean; k: number; travel: number }[] = [];
  const wind = Math.sign(signedArea(from)) || 1;
  for (const opposite of [false, true]) {
    // Same winding as the source first; the opposite winding is a candidate
    // because a thin loop can twist into a figure eight otherwise.
    const B = loopToPolyline(withWinding(to, opposite ? -wind : wind), n);
    for (let k = 0; k < n; k++) cands.push({ pts: B, opposite, k, travel: uniformTravel(A, B, k) });
  }
  cands.sort((x, y) => x.travel - y.travel || Number(x.opposite) - Number(y.opposite) || x.k - y.k);
  const perimeter = A.reduce((acc, p, i) => acc + Math.sqrt(sq(p, A[(i + 1) % n]!)), 0);
  const meanEdge = perimeter / n;
  const band = Math.max(1, Math.round(n * o.warpBand));
  const attempts = o.correspondence === "warp" ? Math.min(3, cands.length) : 1;
  const failures: MorphFailure[] = [];
  for (let c = 0; c < attempts; c++) {
    const cand = cands[c]!;
    const B = rotated(cand.pts, cand.k);
    let fromPts = A,
      toPts = B;
    if (o.correspondence === "warp") {
      const path = warpAlign(A, B, band, o.warpPenalty * meanEdge * meanEdge);
      fromPts = spreadRuns(path.map(([i]) => i), A);
      toPts = spreadRuns(path.map(([, j]) => j), B);
    }
    const bad = o.checkProgress.filter((t) =>
      polygonSelfIntersects(fromPts.map((p, i) => [p[0] + (toPts[i]![0] - p[0]) * t, p[1] + (toPts[i]![1] - p[1]) * t])),
    );
    if (bad.length) {
      failures.push({
        code: "self-intersection",
        message: `the shape correspondence self-intersects at progress ${bad.join(", ")}`,
        progress: bad,
      });
      continue;
    }
    const fromLoop = polylineLoop(fromPts),
      toLoop = polylineLoop(toPts);
    const reversed = Math.sign(signedArea(to) || 1) !== Math.sign(signedArea(toLoop) || 1);
    const frame = (tRaw: number): Cubic[] => {
      const t = clamp01(tRaw);
      return polylineLoop(fromPts.map((p, i) => [p[0] + (toPts[i]![0] - p[0]) * t, p[1] + (toPts[i]![1] - p[1]) * t]));
    };
    return {
      ok: true,
      track: { from: fromLoop, to: toLoop, frame, fromPoints: fromPts, toPoints: toPts, reversed, rotation: cand.k },
    };
  }
  return { ok: false, failure: failures[0]! };
}
