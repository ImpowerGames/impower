import {
  anchorFractions,
  clamp01,
  copyLoop,
  dist,
  lerpLoops,
  lerpLoopsAngular,
  loopExtent,
  resampleAtFractions,
  selfIntersects,
  signedArea,
  withWinding,
} from "../geometry/cubic";
import type { Cubic, MorphFailure, SubpathTrack } from "../types";
import { prepareLoop } from "./match";

export interface TraceOptions {
  /**
   * A nearly closed loop's ends are snapped together when within this
   * fraction of its perimeter, so the seam never becomes an extra anchor.
   */
  seamTolerance?: number;
  /**
   * How many corner-to-corner alignments to evaluate fully per winding,
   * after ranking every alignment by a cheap travel estimate.
   */
  alignments?: number;
  /**
   * A dissolved node keeps at least this fraction of its edge's length
   * from either end of the edge, so it never coincides with a real anchor.
   */
  minGap?: number;
  /** `angular` keeps smooth nodes smooth; `linear` blends handle points. */
  handles?: "angular" | "linear";
  /** Progress values at which self-intersection is checked. */
  checkProgress?: number[];
}

export const TRACE_DEFAULTS: Required<TraceOptions> = {
  seamTolerance: 0.02,
  alignments: 8,
  minGap: 0.004,
  handles: "angular",
  // The rest poses and nine points between: a crossing that opens and
  // closes between two coarser samples (the hook fixtures cross at 0.3)
  // would otherwise slip through, and a drawing that crosses itself at rest
  // is refused rather than morphed.
  checkProgress: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1],
};

export interface TraceTrack extends SubpathTrack {
  /** Whether the target was reversed to match the source winding. */
  reversed: boolean;
  /** The chosen alignment: the target's arc-length offset relative to the source. */
  phase: number;
  /** Summed anchor travel of the chosen alignment. */
  travel: number;
}

export type TraceResult = { ok: true; track: TraceTrack } | { ok: false; failure: MorphFailure };

const wrap = (u: number) => ((u % 1) + 1) % 1;

/**
 * Pairs the drawings' anchors along the outline. Both loops keep their own
 * anchors and handles. With equal anchor counts they pair anchor with
 * anchor, so a square to a tilted quadrilateral keeps four corners. With
 * different counts, where one drawing has an anchor the other lacks, the
 * other receives a dissolved node at the same arc-length position, an
 * exact sub-cubic split that leaves its shape unchanged; a corner the
 * target lacks then flattens into an edge. Straight edges stay straight
 * and corners stay sharp throughout.
 *
 * The alignment is searched over both windings: every anchor-to-anchor
 * alignment is a candidate, ranked by a cheap travel estimate; the best few
 * are built exactly, checked for self-intersection at `checkProgress`, and
 * the least anchor travel wins. Ties fall to the earlier candidate.
 */
export function traceTrack(fromRaw: Cubic[], toRaw: Cubic[], options: TraceOptions = {}): TraceResult {
  const o = { ...TRACE_DEFAULTS, ...options };
  if (!fromRaw.length || !toRaw.length) {
    return { ok: false, failure: { code: "empty-geometry", message: "both drawings need at least one segment" } };
  }
  const a = prepareLoop(fromRaw, o.seamTolerance),
    toClosed = prepareLoop(toRaw, o.seamTolerance);
  const wind = Math.sign(signedArea(a)) || 1;
  const pa = anchorFractions(a);
  const blend = o.handles === "angular" ? lerpLoopsAngular : lerpLoops;
  const failures: MorphFailure[] = [];
  let best: { aOut: Cubic[]; bOut: Cubic[]; travel: number; phase: number } | null = null;
  const consider = (aOut: Cubic[], bOut: Cubic[], phase: number) => {
    if (aOut.length !== bOut.length) return;
    const bad = o.checkProgress.filter((t) => selfIntersects(blend(aOut, bOut, t)));
    if (bad.length) {
      failures.push({ code: "self-intersection", message: `the trace correspondence self-intersects at progress ${bad.join(", ")}`, progress: bad });
      return;
    }
    let travel = 0;
    for (let k = 0; k < aOut.length; k++) travel += dist(aOut[k]!.p0, bOut[k]!.p0);
    // Ties fall to the earlier candidate, judged relative to the travel.
    if (!best || travel < best.travel - 1e-9 * Math.max(best.travel, loopExtent(a))) best = { aOut, bOut, travel, phase };
  };
  for (const opposite of [false, true]) {
    const b = withWinding(toClosed, opposite ? -wind : wind);
    const pb = anchorFractions(b);
    if (pa.length === pb.length) {
      // Anchor with anchor: try every rotation of the target's node order.
      const n = pa.length;
      const rotations: { j: number; estimate: number }[] = [];
      for (let j = 0; j < n; j++) {
        let estimate = 0;
        for (let i = 0; i < n; i++) estimate += dist(a[i]!.p0, b[(i + j) % n]!.p0);
        rotations.push({ j, estimate });
      }
      rotations.sort((x, y) => x.estimate - y.estimate || x.j - y.j);
      for (const { j } of rotations.slice(0, Math.max(1, o.alignments))) {
        consider(a, b.slice(j).concat(b.slice(0, j)), wrap(pb[j]! - pa[0]!));
      }
      continue;
    }
    // Unequal counts: every anchor of the drawing with more anchors pairs
    // with an anchor of the other, in cyclic order, where the total travel
    // is least; the leftover anchors get dissolved nodes on the other
    // drawing. Each start pairing is a candidate.
    const aIsLarger = pa.length >= pb.length;
    const L = aIsLarger ? a : b,
      S = aIsLarger ? b : a;
    const pL = aIsLarger ? pa : pb,
      pS = aIsLarger ? pb : pa;
    const cands: { start: number; cost: number; match: number[] }[] = [];
    for (let start = 0; start < L.length; start++) {
      const m = monotoneMatch(S, L, start);
      cands.push({ start, cost: m.cost, match: m.match });
    }
    cands.sort((x, y) => x.cost - y.cost || x.start - y.start);
    for (const cand of cands.slice(0, Math.max(1, o.alignments))) {
      const { small, large } = dissolveInto(S, pS, L, pL, cand.match, o.minGap);
      const aOut = aIsLarger ? large : small,
        bOut = aIsLarger ? small : large;
      consider(aOut, bOut, wrap(pL[cand.start]! - pS[0]!));
    }
  }
  if (!best) {
    return {
      ok: false,
      failure: failures[0] ?? { code: "self-intersection", message: "no trace correspondence could be built" },
    };
  }
  const chosen: { aOut: Cubic[]; bOut: Cubic[]; travel: number; phase: number } = best;
  const reversed = Math.sign(signedArea(toClosed) || 1) !== Math.sign(signedArea(chosen.bOut) || 1);
  const frame = (tRaw: number): Cubic[] => {
    const t = clamp01(tRaw);
    if (t <= 0) return copyLoop(chosen.aOut);
    if (t >= 1) return copyLoop(chosen.bOut);
    return blend(chosen.aOut, chosen.bOut, t);
  };
  return {
    ok: true,
    track: { from: chosen.aOut, to: chosen.bOut, frame, reversed, phase: chosen.phase, travel: chosen.travel },
  };
}


/**
 * Pairs every anchor of the smaller loop `S` with an anchor of the larger
 * loop `L`, in cyclic order starting from `S[0]` paired with `L[start]`,
 * minimising the total distance between paired anchors. A dynamic
 * programme over the order-preserving choices; `match[k]` is the index in
 * `L` paired with `S[k]`.
 */
function monotoneMatch(S: Cubic[], L: Cubic[], start: number): { cost: number; match: number[] } {
  const m = S.length,
    n = L.length;
  const at = (i: number) => L[(start + i) % n]!.p0;
  // cost[k][i]: best cost pairing S[0..k] with S[k] at offset i.
  const INF = Number.POSITIVE_INFINITY;
  const cost: number[][] = [];
  const from: number[][] = [];
  for (let k = 0; k < m; k++) {
    cost.push(new Array<number>(n).fill(INF));
    from.push(new Array<number>(n).fill(-1));
  }
  cost[0]![0] = dist(S[0]!.p0, at(0));
  for (let k = 1; k < m; k++) {
    let bestPrev = INF,
      bestIdx = -1;
    // Offsets must leave room for the remaining anchors.
    for (let i = k; i <= n - (m - k); i++) {
      const prev = cost[k - 1]![i - 1]!;
      if (prev < bestPrev) {
        bestPrev = prev;
        bestIdx = i - 1;
      }
      if (bestPrev < INF) {
        cost[k]![i] = bestPrev + dist(S[k]!.p0, at(i));
        from[k]![i] = bestIdx;
      }
    }
  }
  let end = -1,
    total = INF;
  for (let i = m - 1; i < n; i++) {
    const c = cost[m - 1]![i]!;
    if (c < total) {
      total = c;
      end = i;
    }
  }
  const offsets: number[] = new Array<number>(m);
  let i = end;
  for (let k = m - 1; k >= 0; k--) {
    offsets[k] = i;
    i = from[k]![i]!;
  }
  return { cost: total, match: offsets.map((off) => (start + off) % n) };
}

/**
 * Gives the smaller loop a dissolved node for every unpaired anchor of the
 * larger loop, at the same relative arc-length position between the
 * neighbouring paired anchors, and rotates the larger loop so paired
 * anchors line up index for index. Both come back with the larger count.
 */
function dissolveInto(
  S: Cubic[],
  pS: number[],
  L: Cubic[],
  pL: number[],
  match: number[],
  minGap: number,
): { small: Cubic[]; large: Cubic[] } {
  const m = S.length,
    n = L.length;
  const fwd = (u0: number, u1: number) => {
    const d = wrap(u1 - u0);
    return d === 0 ? 1 : d;
  };
  const fractions: number[] = [];
  for (let k = 0; k < m; k++) {
    const kNext = (k + 1) % m;
    const i0 = match[k]!,
      i1 = match[kNext]!;
    const spanL = fwd(pL[i0]!, pL[i1]!),
      spanS = fwd(pS[k]!, pS[kNext]!);
    fractions.push(pS[k]!);
    // Unpaired anchors of L strictly between i0 and i1, in cyclic order.
    for (let step = 1; step < n; step++) {
      const j = (i0 + step) % n;
      if (j === i1) break;
      const rel = Math.min(1 - minGap, Math.max(minGap, fwd(pL[i0]!, pL[j]!) / spanL));
      fractions.push(wrap(pS[k]! + rel * spanS));
    }
  }
  const small = resampleAtFractions(S, fractions);
  const large = L.slice(match[0]!).concat(L.slice(0, match[0]!));
  return { small, large };
}
