import { clamp01, dist, polygonArea } from "./geometry/cubic";
import type { TaperTrack } from "./methods/taper";
import type { Point } from "./types";

/** A moving edge: a taper track with the identity of the shape it came from. */
export interface EdgeTrack {
  id: string;
  label: string;
  track: TaperTrack;
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

export type ApertureDiagnosticCode = "unpaired-edge" | "ambiguous";

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
 * tips coincide pairwise at progress 0. Groups of three or more mutually
 * adjacent edges are ambiguous and are reported rather than guessed; a lone
 * edge is reported as unpaired. Two apertures come back for two separate
 * eyes; the caller unions them within one clip entry.
 */
export function buildApertures(edges: EdgeTrack[], options: ApertureOptions = {}): ApertureResult {
  const points = Math.max(4, options.points ?? 24);
  const tolFrac = options.tipTolerance ?? 0.2;
  const tips = edges.map((e) => e.track.tips(0));
  const spans = tips.map(([a, b]) => dist(a, b));
  const adjacent = (i: number, j: number): boolean => {
    const [a1, a2] = tips[i]!,
      [b1, b2] = tips[j]!;
    const span = Math.min(spans[i]!, spans[j]!);
    const tol = Math.max(options.tipToleranceMin ?? 0.04 * span, tolFrac * span);
    const straight = dist(a1, b1) <= tol && dist(a2, b2) <= tol;
    const crossed = dist(a1, b2) <= tol && dist(a2, b1) <= tol;
    return straight || crossed;
  };
  const seen = new Set<number>();
  const groups: number[][] = [];
  for (let i = 0; i < edges.length; i++) {
    if (seen.has(i)) continue;
    const group = [i];
    seen.add(i);
    for (let k = 0; k < group.length; k++) {
      for (let j = 0; j < edges.length; j++) {
        if (!seen.has(j) && adjacent(group[k]!, j)) {
          seen.add(j);
          group.push(j);
        }
      }
    }
    groups.push(group);
  }
  const apertures: Aperture[] = [];
  const diagnostics: ApertureDiagnostic[] = [];
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
    apertures.push(makeAperture(edges[group[0]!]!, edges[group[1]!]!, points));
  }
  return { apertures, diagnostics };
}

function makeAperture(A: EdgeTrack, B: EdgeTrack, points: number): Aperture {
  const [a1] = A.track.tips(0);
  const [b1, b2] = B.track.tips(0);
  // B's boundary runs tip one to tip two; flip it when B's tip one sits at
  // A's tip two so both boundaries run the same way.
  const flipB = dist(a1, b2) < dist(a1, b1);
  // Which side of each edge faces the other is decided at the progress
  // where the two edges are farthest apart: at a closed pose the sides are
  // indistinguishable, and a blink authored closed-to-open would otherwise
  // pick one arbitrarily.
  let facingA = 0,
    facingB = 0,
    farthest = -1;
  for (const t of [0, 0.5, 1]) {
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
  const loop = (tRaw: number): Point[] => {
    const t = clamp01(tRaw);
    const ea = A.track.edges(t, points),
      eb = B.track.edges(t, points);
    const a = ea[facingA]!;
    let b = eb[facingB]!;
    if (flipB) b = b.slice().reverse();
    // The opening direction follows the edges as they move, so a rigid
    // rotation of the whole eye is not mistaken for closure; once the two
    // edges' centres coincide there is no opening left.
    const mA = mean([...ea[0], ...ea[1]]),
      mB = mean([...eb[0], ...eb[1]]);
    const ox = mB[0] - mA[0],
      oy = mB[1] - mA[1],
      olen = Math.hypot(ox, oy);
    const closed = farthest <= 0 || olen <= 1e-9 * farthest;
    const dir: Point = closed ? [0, 0] : [ox / olen, oy / olen];
    const top: Point[] = [],
      bottom: Point[] = [];
    for (let i = 0; i < points; i++) {
      const p = a[i]!,
        q = b[i]!;
      const gap = (q[0] - p[0]) * dir[0] + (q[1] - p[1]) * dir[1];
      if (closed || gap < 0) {
        const m: Point = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
        top.push(m);
        bottom.push(m);
      } else {
        top.push(p);
        bottom.push(q);
      }
    }
    return [...top, ...bottom.reverse()];
  };
  return {
    edgeIds: [A.id, B.id],
    loop,
    area: (t) => Math.abs(polygonArea(loop(t))),
  };
}
