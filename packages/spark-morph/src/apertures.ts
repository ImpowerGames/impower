import { clamp01, dist, polygonArea } from "./geometry/cubic";
import type { BendTrack } from "./methods/bend";
import type { Point } from "./types";

/** A moving edge: a bend track with the identity of the shape it came from. */
export interface EdgeTrack {
  id: string;
  label: string;
  track: BendTrack;
}

export interface Aperture {
  /** The two edges whose facing boundaries enclose the opening. */
  edgeIds: [string, string];
  /**
   * The opening at `progress` as a closed polyline: the first edge's facing
   * boundary from tip to tip, then the second's back. Where the boundaries
   * have crossed, both sides sit on their midline, so a fully closed
   * aperture has zero area rather than an inverted one.
   */
  loop(progress: number): Point[];
  area(progress: number): number;
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
  /** Points sampled along each facing boundary, tips included. */
  points?: number;
  /**
   * Two tips count as adjacent when closer than this fraction of the
   * shorter tip-to-tip span.
   */
  tipTolerance?: number;
  /**
   * Absolute floor for the tip tolerance in user units. Defaults to a
   * fraction of the span so it scales with the art.
   */
  tipToleranceMin?: number;
}

/** The larger side of the points' bounding box. */
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

/**
 * Builds apertures from edge tracks. Two edges form one aperture when their
 * tips coincide pairwise at either rest pose, progress 0 or 1: open lashes
 * whose corner tips do not quite meet still close onto one shared lash, and
 * the shared pose identifies them. Groups of three or more mutually adjacent
 * edges are ambiguous and are reported rather than guessed; a lone edge is
 * reported as unpaired. Two apertures come back for two separate eyes; the
 * caller unions them within one clip entry.
 */
export function buildApertures(edges: EdgeTrack[], options: ApertureOptions = {}): ApertureResult {
  const points = Math.max(4, options.points ?? 24);
  const tolFrac = options.tipTolerance ?? 0.2;
  const poses = [0, 1].map((t) => {
    const tips = edges.map((e) => e.track.tips(t));
    return { tips, spans: tips.map(([a, b]) => dist(a, b)) };
  });
  const spans = poses[0]!.spans;
  const diagnostics: ApertureDiagnostic[] = [];
  // An edge whose two tips coincide has no span to measure adjacency
  // against and cannot bound an opening; it is reported, never paired.
  const degenerate = new Set<number>();
  edges.forEach((e, i) => {
    if (!(spans[i]! > 0)) {
      degenerate.add(i);
      diagnostics.push({ code: "degenerate-edge", edgeIds: [e.id], message: `edge "${e.id}" (${e.label}) has coincident tips and no span` });
    }
  });
  /**
   * How edge j's tips meet edge i's: `false` when they are not adjacent at
   * either rest pose, otherwise whether j's tip one sits at i's tip two.
   */
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

/**
 * The first proper crossing between two non-adjacent segments of a closed
 * polyline: segment `i` runs from point `i` to point `i + 1`, `j > i`, and
 * `x` is where they cross. Collinear overlaps, such as a closed stretch's
 * zero-width slit, are not crossings.
 */
function firstCrossing(pts: Point[]): { i: number; j: number; x: Point } | undefined {
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
      if (t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9) return { i, j, x: [p[0] + t * rx, p[1] + t * ry] };
    }
  }
  return undefined;
}

/**
 * Removes every self-crossing from an aperture loop. Where the two
 * boundaries have passed each other between samples, the loop winds back on
 * itself in a lobe of the opposite orientation; at each crossing the loop
 * splits in two at the crossing point, and the part winding the way the
 * opening does (`sign` of its area) is kept, or the larger part when both
 * or neither do. Each split removes at least one point, so this ends.
 * `snap` places each crossing point, so a loop whose points are written at
 * a fixed precision is untangled as written.
 */
export function untangle(loop: Point[], sign: number, snap: (p: Point) => Point = (p) => p): Point[] {
  let pts = loop;
  for (let hit = firstCrossing(pts); hit && pts.length >= 3; hit = firstCrossing(pts)) {
    const { inner, outer, keepInner } = split(pts, hit.i, hit.j, snap(hit.x), sign);
    pts = keepInner ? inner : outer;
  }
  return pts;
}

/**
 * A loop split at crossing point `x` of its segments `i` and `j`: the inner
 * part runs from `x` through points `i + 1` to `j`, the outer part through
 * the rest, and the part kept is the one winding the way `sign` says, or
 * the larger when both or neither do.
 */
function split(pts: Point[], i: number, j: number, x: Point, sign: number) {
  const inner = [x, ...pts.slice(i + 1, j + 1)];
  const outer = [...pts.slice(0, i + 1), x, ...pts.slice(j + 1)];
  const ai = polygonArea(inner),
    ao = polygonArea(outer);
  const innerRight = Math.sign(ai) === sign,
    outerRight = Math.sign(ao) === sign;
  return { inner, outer, keepInner: innerRight !== outerRight ? innerRight : Math.abs(ai) >= Math.abs(ao) };
}

/**
 * Removes every self-crossing from a loop as `untangle` does, keeping its
 * number of points: the points of the part not kept all move to the
 * crossing. Samples a player blends point by point stay the same length.
 */
export function pinchCrossings(loop: Point[], sign: number, snap: (p: Point) => Point = (p) => p): Point[] {
  const pts = loop.slice();
  const n = pts.length;
  // Each pass moves at least one point onto another, but a crossing point
  // that snapping moves can recreate a crossing, so passes are bounded.
  for (let pass = 0, hit = firstCrossing(pts); hit && pass < n * n; pass++, hit = firstCrossing(pts)) {
    const { i, j } = hit;
    const x = snap(hit.x);
    const { keepInner } = split(pts, i, j, x, sign);
    for (let k = 0; k < n; k++) {
      if (k > i && k <= j ? !keepInner : keepInner) pts[k] = x;
    }
  }
  return pts;
}

/**
 * Which side of the polyline `line` the point `q` lies on, as the cross
 * product of the nearest segment's direction with the offset from that
 * segment's nearest point: positive to the left of the line's direction,
 * negative to the right, scaled by the segment's length. A point whose
 * nearest place on the line is one of its two ends lies beyond the line,
 * not to either side of it, and has no side: `undefined`.
 */
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

/**
 * The points closing an aperture's corner where its two boundaries end
 * apart, as open lashes whose tips do not meet do. The loop runs from `p` to
 * `q` here with the opening on its left when `facing` is positive, and the
 * corner closes through a rectangle beyond the line between them. At a rest
 * pose it is a square the gap's own width deep: eye white drawn in the gap
 * is uncovered by either lash and bulges past that line however the lashes'
 * tips point, so the opening reaches around it, and a clip only hides, so a
 * corner reaching past the white shows nothing the static image does not.
 * Between the poses its depth falls with the square of how far the gap has
 * closed from `restGap`, the corner's widest gap at a rest pose, so white
 * the closing lashes leave behind does not show past them. Empty when the
 * boundaries meet, or met at both rest poses.
 */
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

/**
 * `flipB` is set when B's tip one sits at A's tip two, at the rest pose where
 * their tips meet; B's boundary, which runs tip one to tip two, is then
 * reversed so both boundaries run the same way.
 */
function makeAperture(A: EdgeTrack, B: EdgeTrack, flipB: boolean, points: number): Aperture {
  // Which side of each edge faces the other is decided at the progress
  // where the two edges are farthest apart, sampled at eleven points so an
  // opening that appears between the rest poses is still seen: at a closed
  // pose the sides are indistinguishable, and a blink authored
  // closed-to-open would otherwise pick one arbitrarily.
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
  // Each corner's widest gap at a rest pose bounds how far its cap reaches.
  const restGaps = [0, 1].map((t) => {
    const a = A.track.edges(t, points)[facingA]!;
    let b = B.track.edges(t, points)[facingB]!;
    if (flipB) b = b.slice().reverse();
    return [dist(a[0]!, b[0]!), dist(a[points - 1]!, b[points - 1]!)] as const;
  });
  const startGap = Math.max(restGaps[0]![0], restGaps[1]![0]),
    endGap = Math.max(restGaps[0]![1], restGaps[1]![1]);
  const loop = (tRaw: number): Point[] => {
    const t = clamp01(tRaw);
    const ea = A.track.edges(t, points),
      eb = B.track.edges(t, points);
    const a = ea[facingA]!;
    let b = eb[facingB]!;
    if (flipB) b = b.slice().reverse();
    // The opening direction follows the edges as they move, so a rigid
    // rotation of the whole eye is not mistaken for closure; once the two
    // edges' centres coincide, relative to the edges' own extent at this
    // progress, there is no opening left.
    const mA = mean([...ea[0], ...ea[1]]),
      mB = mean([...eb[0], ...eb[1]]);
    const ox = mB[0] - mA[0],
      oy = mB[1] - mA[1],
      olen = Math.hypot(ox, oy);
    const extent = pointsExtent([...ea[0], ...ea[1], ...eb[0], ...eb[1]]);
    const closed = extent <= 0 || olen <= 1e-9 * extent;
    const dir: Point = closed ? [0, 0] : [ox / olen, oy / olen];
    // A crossed rib sits on its midline on both runs, so a closed stretch
    // is a zero-width slit the clip can ignore, and a fully closed aperture
    // is its midline traced out and back, with no area. It keeps the open
    // loop's run of points, so an opening blended towards it closes onto the
    // lashes' line rather than onto the chord between their tips. A rib has
    // crossed when either point lies past the other edge's boundary, judged
    // against the nearest stretch of that boundary rather than against the
    // point of the same index: the two boundaries' samples need not sit
    // level along the lash, as when the open lashes' corner tips do not
    // meet, and comparing the paired points would read that offset as an
    // opening or a closure. Both boundaries run the same way, so the opening
    // lies on opposite sides of them.
    const cx = a[points - 1]![0] - a[0]![0],
      cy = a[points - 1]![1] - a[0]![1];
    const facing = Math.sign(cx * dir[1] - cy * dir[0]) || 1;
    const top: Point[] = [],
      bottom: Point[] = [];
    let anyOpen = false;
    for (let i = 0; i < points; i++) {
      const p = a[i]!,
        q = b[i]!;
      const qSide = sideOf(a, q),
        pSide = sideOf(b, p);
      const gap = closed ? 0 : Math.min(qSide === undefined ? 0 : facing * qSide, pSide === undefined ? 0 : -facing * pSide);
      if (closed || gap < 0) {
        const m: Point = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
        top.push(m);
        bottom.push(m);
      } else {
        anyOpen = true;
        top.push(p);
        bottom.push(q);
      }
    }
    if (!anyOpen) return [...top, ...bottom.reverse()];
    const last = points - 1;
    const end = corner(top[last]!, bottom[last]!, facing, extent, endGap);
    const start = corner(bottom[0]!, top[0]!, facing, extent, startGap);
    // The opening lies to the left of A's run exactly when `facing` is
    // positive, so a correctly oriented loop has that sign of area.
    const untangled = untangle([...top, ...end, ...bottom.reverse(), ...start], facing);
    return untangled.length >= 3 ? untangled : [top[0]!, top[last]!];
  };
  return {
    edgeIds: [A.id, B.id],
    loop,
    area: (t) => Math.abs(polygonArea(loop(t))),
  };
}
