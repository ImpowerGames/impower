import { clamp01, dist, polygonArea } from "./geometry/cubic";
import type { RibbonTrack } from "./methods/ribbon";
import type { Point } from "./types";

/** A moving edge: a ribbon track with the identity of the shape it came from. */
export interface EdgeTrack {
  id: string;
  label: string;
  track: RibbonTrack;
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
   * shorter tip-to-tip span, with a floor in user units.
   */
  tipTolerance?: number;
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
  const tolMin = options.tipToleranceMin ?? 4;
  const tips = edges.map((e) => e.track.tips(0));
  const spans = tips.map(([a, b]) => dist(a, b));
  const adjacent = (i: number, j: number): boolean => {
    const [a1, a2] = tips[i]!,
      [b1, b2] = tips[j]!;
    const tol = Math.max(tolMin, tolFrac * Math.min(spans[i]!, spans[j]!));
    const straight = dist(a1, b1) <= tol && dist(a2, b2) <= tol;
    const crossed = dist(a1, b2) <= tol && dist(a2, b1) <= tol;
    return straight || crossed;
  };
  // Connected components of the adjacency graph, in input order.
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
  const edgesA0 = A.track.edges(0, points),
    edgesB0 = B.track.edges(0, points);
  const meanA = mean([...edgesA0[0], ...edgesA0[1]]),
    meanB = mean([...edgesB0[0], ...edgesB0[1]]);
  // The facing boundary of each edge is the one nearer the other edge.
  const facingA = dist(mean(edgesA0[0]), meanB) <= dist(mean(edgesA0[1]), meanB) ? 0 : 1;
  const facingB = dist(mean(edgesB0[0]), meanA) <= dist(mean(edgesB0[1]), meanA) ? 0 : 1;
  const open: Point = [meanB[0] - meanA[0], meanB[1] - meanA[1]];
  const openLen = Math.hypot(open[0], open[1]) || 1;
  const dir: Point = [open[0] / openLen, open[1] / openLen];
  const loop = (tRaw: number): Point[] => {
    const t = clamp01(tRaw);
    const a = A.track.edges(t, points)[facingA];
    let b = B.track.edges(t, points)[facingB];
    if (flipB) b = b.slice().reverse();
    const top: Point[] = [],
      bottom: Point[] = [];
    for (let i = 0; i < points; i++) {
      const p = a[i]!,
        q = b[i]!;
      const gap = (q[0] - p[0]) * dir[0] + (q[1] - p[1]) * dir[1];
      if (gap < 0) {
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
