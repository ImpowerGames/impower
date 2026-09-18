import {
  ArcLoop,
  chainToPolyline,
  clamp01,
  copyLoop,
  cubicKnots,
  dist,
  dropZeroSegments,
  evalCubic,
  fitCubic,
  lerpLoops,
  loopExtent,
  loopToPolyline,
  polylineLoop,
  reverseLoop,
  selfIntersects,
  signedArea,
  snapClosed,
  withWinding,
} from "../geometry/cubic";
import type { Cubic, MorphFailure, Point, SubpathTrack } from "../types";

/**
 * Options for the taper method. Every default that is a distance is a
 * fraction of the drawing's own size, so art at any scale behaves alike;
 * the prototype's hand-tuned pixel values are reproduced for lash art
 * about a hundred units wide.
 */
export interface TaperOptions {
  /**
   * Anchor count of the canonical loop: two per tip plus an even body count
   * split across the two edges. Minimum 6.
   */
  anchors?: number;
  /**
   * Distance in user units from each tip to its flanking anchors. When
   * omitted, it is measured from where each loop's taper ends.
   */
  tipDistance?: number;
  /**
   * Blend the simplified canonical loop back to the authored art at the rest
   * poses so the first and last frames match the drawing. Frames then become
   * polylines of `handoffPoints` points.
   */
  handoff?: boolean;
  /** Points in each handoff polyline; values under 8 are raised to 8. */
  handoffPoints?: number;
  /**
   * Minimum angle, in degrees, by which the outline must fold back over a
   * twentieth of the perimeter at each of the two tips. Sharp lash tips fold
   * about 160 degrees and rounded tips about 140; the smooth end of a
   * teardrop folds about 70 and is not a tip.
   */
  tipFoldDegrees?: number;
  /**
   * The mid-morph area must stay at or above this fraction of the thinner
   * endpoint's area, otherwise the correspondence is pinching.
   */
  thicknessRatio?: number;
  /**
   * The canonical loop's area may differ from the authored loop's by at
   * most this fraction, otherwise the tips did not describe the drawing.
   */
  reconstructionTolerance?: number;
  /**
   * A nearly closed loop's ends are snapped together when within this
   * fraction of its perimeter.
   */
  seamTolerance?: number;
  /** Progress values at which self-intersection and thickness are checked. */
  checkProgress?: number[];
}

export const TAPER_DEFAULTS: Required<TaperOptions> = {
  anchors: 6,
  tipDistance: NaN,
  handoff: true,
  handoffPoints: 48,
  tipFoldDegrees: 90,
  thicknessRatio: 0.62,
  reconstructionTolerance: 0.5,
  seamTolerance: 0.02,
  checkProgress: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9],
};

export interface TaperTips {
  /** Loop fractions of the two tips. */
  f1: number;
  f2: number;
  p1: Point;
  p2: Point;
  /** Fold angles in radians; PI is a full reversal. */
  fold1: number;
  fold2: number;
}

/**
 * The two tapered tips of a taper: the two best-separated places where the
 * outline folds back on itself. Candidates are always ranked, so a blob
 * still yields two "tips" with small fold angles; callers judge `fold1` and
 * `fold2` rather than trusting the positions.
 */
export function findTips(loop: Cubic[]): TaperTips {
  const arc = new ArcLoop(loop);
  const N = 260,
    W = 0.05;
  const samp: { f: number; k: number; pt: Point }[] = [];
  for (let i = 0; i < N; i++) {
    const f = i / N,
      a = arc.pointAt(f - W),
      b = arc.pointAt(f),
      c = arc.pointAt(f + W);
    const ix = b[0] - a[0],
      iy = b[1] - a[1],
      ox = c[0] - b[0],
      oy = c[1] - b[1];
    const li = Math.hypot(ix, iy) || 1,
      lo = Math.hypot(ox, oy) || 1;
    const fold = Math.acos(Math.max(-1, Math.min(1, (ix * ox + iy * oy) / (li * lo))));
    samp.push({ f, k: fold, pt: b });
  }
  samp.sort((a, b) => b.k - a.k || a.f - b.f);
  const t1 = samp[0]!;
  let t2 = samp[1]!;
  for (const s of samp) {
    const fwd = (((s.f - t1.f) % 1) + 1) % 1;
    if (Math.min(fwd, 1 - fwd) > 0.25) {
      t2 = s;
      break;
    }
  }
  return { f1: t1.f, f2: t2.f, p1: t1.pt, p2: t2.pt, fold1: t1.k, fold2: t2.k };
}

/**
 * Where each tip's taper ends and the straight body begins, in user units,
 * taken as the smaller of a width-plateau criterion and a wedge-depth
 * criterion, floored at 2% and capped at 12% of the tip-to-tip span (the
 * prototype's hand-tuned 16 pixels on a lash about 130 wide).
 */
export function taperDistance(loop: Cubic[], tips: TaperTips): number {
  const arc = new ArcLoop(loop);
  const total = arc.total;
  const STEPS = 60,
    maxS = total * 0.45,
    K = 0.9;
  const tipPx = (fT: number): number => {
    const w: number[] = [],
      reachA: number[] = [];
    const T = arc.pointAt(fT);
    for (let k = 1; k <= STEPS; k++) {
      const s = (maxS * k) / STEPS,
        Pa = arc.pointAt(fT + s / total),
        Pb = arc.pointAt(fT - s / total);
      w.push(dist(Pa, Pb));
      reachA.push(Math.hypot(T[0] - (Pa[0] + Pb[0]) / 2, T[1] - (Pa[1] + Pb[1]) / 2));
    }
    const sAt = (k: number) => (maxS * (k + 1)) / STEPS;
    const maxW = Math.max(...w);
    let plateauS = maxS;
    if (maxW < 1e-6 * total) plateauS = maxS * 0.4;
    else {
      for (let k = 0; k < w.length; k++) {
        if (w[k]! >= 0.9 * maxW) {
          plateauS = sAt(k);
          break;
        }
      }
    }
    let wedgeS = sAt(0);
    for (let k = 0; k < reachA.length; k++) {
      if (reachA[k]! <= K * w[k]!) wedgeS = sAt(k);
      else break;
    }
    return Math.min(plateauS, wedgeS);
  };
  const span = dist(tips.p1, tips.p2);
  const px = Math.min(tipPx(tips.f1), tipPx(tips.f2));
  return Math.max(0.02 * span, Math.min(px, span * 0.12));
}

/**
 * Makes each nearly smooth anchor's two handles exactly collinear (the
 * drawing program's "convert node to smooth"), keeping each handle's own
 * length: authoring noise of a few degrees is removed so the node does not
 * kink. A node whose handles meet at a real angle, such as where a rounded
 * tip's arc joins the body edge or a cusp, is a corner the artist drew and
 * is left alone. Runs on the sparse authored curve.
 */
export function smoothAnchors(loop: Cubic[], maxDegrees = 25): Cubic[] {
  const n = loop.length;
  const out = copyLoop(loop);
  // |dirOut - dirIn| is 2cos(theta / 2) for the angle theta between the
  // outgoing handle and the reversed incoming one; collinear handles give 2.
  const minSpread = 2 * Math.cos((maxDegrees * Math.PI) / 360);
  const tiny = 1e-9 * loopExtent(loop);
  for (let i = 0; i < n; i++) {
    const P = loop[i]!.p0,
      pi = (i - 1 + n) % n;
    const hIn: Point = [loop[pi]!.c2[0] - P[0], loop[pi]!.c2[1] - P[1]];
    const hOut: Point = [loop[i]!.c1[0] - P[0], loop[i]!.c1[1] - P[1]];
    const lIn = Math.hypot(hIn[0], hIn[1]),
      lOut = Math.hypot(hOut[0], hOut[1]);
    if (lIn <= tiny || lOut <= tiny) continue;
    let tx = hOut[0] / lOut - hIn[0] / lIn,
      ty = hOut[1] / lOut - hIn[1] / lIn;
    const tl = Math.hypot(tx, ty);
    if (tl < minSpread) continue;
    tx /= tl;
    ty /= tl;
    out[i]!.c1 = [P[0] + tx * lOut, P[1] + ty * lOut];
    out[pi]!.c2 = [P[0] - tx * lIn, P[1] - ty * lIn];
  }
  return out;
}

const unit = (a: Point, b: Point): Point => {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    len = Math.hypot(dx, dy) || 1;
  return [dx / len, dy / len];
};
const fwd = (a: number, b: number) => (((b - a) % 1) + 1) % 1;

/** Index layout of a canonical loop with `n1` body anchors per edge. */
export const canonLayout = (anchors: number) => {
  const nBody = Math.max(0, anchors - 4),
    n1 = Math.floor(nBody / 2),
    n2 = nBody - n1;
  return { n1, n2, tipIndices: [0, 1, 2 + n1, 3 + n1] as const };
};

/**
 * Resamples a taper loop into canonical order: tip one as a single bulged
 * cubic between its flanking anchors, `n1` fitted body anchors along the
 * first edge, tip two, then `n2` along the second edge. Index k of two
 * canonical loops correspond. `wind` fixes the winding sign; tip one is the
 * tip nearest `refTip` when given, otherwise the leftmost.
 */
export function canonicalTaper(
  loop: Cubic[],
  anchors: number,
  tipPx: number,
  wind: number,
  tips: TaperTips,
  refTip?: Point,
): Cubic[] {
  const L = Math.sign(signedArea(loop) || 1) !== wind ? reverseLoop(loop) : loop;
  const flipped = L !== loop;
  const arc = new ArcLoop(L);
  const total = arc.total;
  const tipList = [
    { f: flipped ? fwd(tips.f1, 0) : tips.f1, T: tips.p1 },
    { f: flipped ? fwd(tips.f2, 0) : tips.f2, T: tips.p2 },
  ].sort((a, b) =>
    refTip ? dist(a.T, refTip) - dist(b.T, refTip) || a.T[0] - b.T[0] : a.T[0] - b.T[0] || a.T[1] - b.T[1],
  );
  // Fractions of a reversed loop run the other way round.
  const fL = tipList[0]!.f,
    fR = tipList[1]!.f,
    TL = tipList[0]!.T,
    TR = tipList[1]!.T;
  const d = tipPx / total;
  const A1 = fL - d,
    B1 = fL + d,
    A2 = fR - d,
    B2 = fR + d,
    arc1 = fwd(B1, A2),
    arc2 = fwd(B2, A1);
  const { n1, n2, tipIndices } = canonLayout(anchors);
  const fracs: number[] = [],
    isTip: boolean[] = [],
    tipPt: (Point | null)[] = [];
  const push = (f: number, tip: boolean, T: Point | null) => {
    fracs.push(f);
    isTip.push(tip);
    tipPt.push(T);
  };
  push(A1, true, TL);
  push(B1, false, null);
  for (let j = 1; j <= n1; j++) push(B1 + (arc1 * j) / (n1 + 1), false, null);
  push(A2, true, TR);
  push(B2, false, null);
  for (let j = 1; j <= n2; j++) push(B2 + (arc2 * j) / (n2 + 1), false, null);
  const out: Cubic[] = [];
  for (let i = 0; i < fracs.length; i++) {
    const f0 = fracs[i]!,
      f1 = fracs[(i + 1) % fracs.length]!,
      span = fwd(f0, f1),
      P0 = arc.pointAt(f0),
      P3 = arc.pointAt(f1);
    if (isTip[i]) {
      const T = tipPt[i]!,
        dA = unit(P0, arc.pointAt(f0 + span * 0.2)),
        dB = unit(P3, arc.pointAt(f1 - span * 0.2));
      const Vx = T[0] - (P0[0] + P3[0]) / 2,
        Vy = T[1] - (P0[1] + P3[1]) / 2,
        Dx = dA[0] + dB[0],
        Dy = dA[1] + dB[1],
        DD = Dx * Dx + Dy * Dy;
      const chord = dist(P0, P3);
      const reach = Math.hypot(Vx, Vy);
      let h = DD < 1e-9 ? chord / 3 : ((8 / 3) * (Vx * Dx + Vy * Dy)) / DD;
      h = Math.max(chord * 0.05, Math.min(h, Math.max(chord, reach) * 4));
      // Handles that reach past each other tie a hairline knot inside the
      // tip; shorten them until the tip curve is simple.
      const tipCubic = (len: number): Cubic => ({
        p0: P0,
        c1: [P0[0] + dA[0] * len, P0[1] + dA[1] * len],
        c2: [P3[0] + dB[0] * len, P3[1] + dB[1] * len],
        p1: P3,
      });
      let tip = tipCubic(h);
      for (let guard = 0; guard < 12 && h > chord * 0.05 && cubicKnots(tip); guard++) {
        h *= 0.8;
        tip = tipCubic(h);
      }
      out.push({
        p0: tip.p0,
        c1: tip.c1,
        c2: tip.c2,
        p1: tip.p1,
      });
    } else {
      const pts: Point[] = [];
      for (let j = 0; j <= 14; j++) pts.push(arc.pointAt(f0 + (span * j) / 14));
      const { c1, c2 } = fitCubic(pts, unit(P0, arc.pointAt(f0 + span * 0.06)), unit(P3, arc.pointAt(f1 - span * 0.06)));
      out.push({ p0: P0, c1, c2, p1: P3 });
    }
  }
  // Symmetrise body anchors so plain linear interpolation stays smooth; the
  // four tip-flanking anchors keep their bulge tapers.
  const tipIdx = new Set<number>(tipIndices),
    nn = out.length;
  const sym = copyLoop(out);
  const tiny = 1e-9 * loopExtent(L);
  for (let i = 0; i < nn; i++) {
    if (tipIdx.has(i)) continue;
    const P = out[i]!.p0,
      pi = (i - 1 + nn) % nn;
    const hIx = out[pi]!.c2[0] - P[0],
      hIy = out[pi]!.c2[1] - P[1],
      hOx = out[i]!.c1[0] - P[0],
      hOy = out[i]!.c1[1] - P[1];
    const lIn = Math.hypot(hIx, hIy),
      lOut = Math.hypot(hOx, hOy);
    if (lIn <= tiny || lOut <= tiny) continue;
    let tx = hOx / lOut - hIx / lIn,
      ty = hOy / lOut - hIy / lIn;
    const tl = Math.hypot(tx, ty);
    if (tl < 0.5) continue;
    tx /= tl;
    ty /= tl;
    const len = (lIn + lOut) / 2;
    sym[i]!.c1 = [P[0] + tx * len, P[1] + ty * len];
    sym[pi]!.c2 = [P[0] - tx * len, P[1] - ty * len];
  }
  // Each flanking anchor's body-side handle points opposite its bulge handle
  // at its own length; collinearity is restored per frame by `alignFlanks`.
  const alignFlank = (idx: number, aType: boolean) => {
    const pi = (idx - 1 + nn) % nn,
      P = sym[idx]!.p0;
    const bulge = aType ? sym[idx]!.c1 : sym[pi]!.c2;
    const bvx = bulge[0] - P[0],
      bvy = bulge[1] - P[1],
      bl = Math.hypot(bvx, bvy);
    if (bl <= tiny) return;
    const seg = aType ? sym[pi]! : sym[idx]!,
      key = aType ? "c2" : "c1";
    const cur = seg[key],
      len = Math.hypot(cur[0] - P[0], cur[1] - P[1]);
    seg[key] = [P[0] - (bvx / bl) * len, P[1] - (bvy / bl) * len];
  };
  alignFlank(0, true);
  alignFlank(1, false);
  alignFlank(2 + n1, true);
  alignFlank(3 + n1, false);
  return sym;
}

/**
 * Per frame, rotates each tip-flanking anchor's collinear handle pair so its
 * body-side handle aims at the point on the neighbouring handle line that is
 * equidistant from the flank anchor and its body neighbour. Keeps the corner
 * from bulging mid-swing.
 */
export function alignFlanks(loop: Cubic[], n1: number): Cubic[] {
  const nn = loop.length,
    out = copyLoop(loop);
  const tiny = 1e-9 * loopExtent(loop);
  for (const [idx, aType] of [
    [0, true],
    [1, false],
    [2 + n1, true],
    [3 + n1, false],
  ] as [number, boolean][]) {
    if (idx >= nn) continue;
    const pi = (idx - 1 + nn) % nn,
      F = out[idx]!.p0;
    const B = aType ? out[pi]!.p0 : out[idx]!.p1;
    const HB = aType ? out[pi]!.c1 : out[idx]!.c2;
    const bodySeg = aType ? out[pi]! : out[idx]!,
      bodyKey = aType ? "c2" : "c1";
    const bulgeSeg = aType ? out[idx]! : out[pi]!,
      bulgeKey = aType ? "c1" : "c2";
    const dbx = HB[0] - B[0],
      dby = HB[1] - B[1],
      dbl = Math.hypot(dbx, dby);
    if (dbl <= tiny) continue;
    const ux = dbx / dbl,
      uy = dby / dbl;
    const wx = B[0] - F[0],
      wy = B[1] - F[1],
      denom = wx * ux + wy * uy;
    if (Math.abs(denom) <= tiny) continue;
    const s = -(wx * wx + wy * wy) / (2 * denom);
    const vx = B[0] + ux * s - F[0],
      vy = B[1] + uy * s - F[1],
      vl = Math.hypot(vx, vy);
    if (vl <= tiny) continue;
    const ax = vx / vl,
      ay = vy / vl;
    const bl = Math.hypot(bodySeg[bodyKey][0] - F[0], bodySeg[bodyKey][1] - F[1]);
    const gl = Math.hypot(bulgeSeg[bulgeKey][0] - F[0], bulgeSeg[bulgeKey][1] - F[1]);
    bodySeg[bodyKey] = [F[0] + ax * bl, F[1] + ay * bl];
    bulgeSeg[bulgeKey] = [F[0] - ax * gl, F[1] - ay * gl];
  }
  return out;
}

/**
 * Interpolates each facing pair of body anchors as a rigid rib: the centre
 * moves linearly while the half-offset rotates the short way and stretches,
 * so facing anchors orbit rather than pass through each other. Handles ride
 * along with their anchors.
 */
export function ribInterpolate(loop: Cubic[], a: Cubic[], b: Cubic[], t: number): Cubic[] {
  const nn = loop.length;
  if (nn < 6) return loop;
  const n1 = Math.floor((nn - 4) / 2),
    n2 = nn - 4 - n1;
  if (n1 !== n2) return loop;
  const out = copyLoop(loop);
  const shift = (i: number, vx: number, vy: number) => {
    const pi = (i - 1 + nn) % nn;
    out[i]!.p0 = [out[i]!.p0[0] + vx, out[i]!.p0[1] + vy];
    out[i]!.c1 = [out[i]!.c1[0] + vx, out[i]!.c1[1] + vy];
    out[pi]!.p1 = [out[pi]!.p1[0] + vx, out[pi]!.p1[1] + vy];
    out[pi]!.c2 = [out[pi]!.c2[0] + vx, out[pi]!.c2[1] + vy];
  };
  for (let k = 0; k < n1; k++) {
    const ta = 2 + k,
      ba = nn - 1 - k;
    const cOx = (a[ta]!.p0[0] + a[ba]!.p0[0]) / 2,
      cOy = (a[ta]!.p0[1] + a[ba]!.p0[1]) / 2;
    const cCx = (b[ta]!.p0[0] + b[ba]!.p0[0]) / 2,
      cCy = (b[ta]!.p0[1] + b[ba]!.p0[1]) / 2;
    const cTx = cOx + (cCx - cOx) * t,
      cTy = cOy + (cCy - cOy) * t;
    const vOx = (a[ta]!.p0[0] - a[ba]!.p0[0]) / 2,
      vOy = (a[ta]!.p0[1] - a[ba]!.p0[1]) / 2;
    const vCx = (b[ta]!.p0[0] - b[ba]!.p0[0]) / 2,
      vCy = (b[ta]!.p0[1] - b[ba]!.p0[1]) / 2;
    const angO = Math.atan2(vOy, vOx);
    let dA = Math.atan2(vCy, vCx) - angO;
    while (dA > Math.PI) dA -= 2 * Math.PI;
    while (dA < -Math.PI) dA += 2 * Math.PI;
    const magO = Math.hypot(vOx, vOy),
      angT = angO + dA * t,
      magT = magO + (Math.hypot(vCx, vCy) - magO) * t;
    const vTx = magT * Math.cos(angT),
      vTy = magT * Math.sin(angT);
    shift(ta, cTx + vTx - out[ta]!.p0[0], cTy + vTy - out[ta]!.p0[1]);
    shift(ba, cTx - vTx - out[ba]!.p0[0], cTy - vTy - out[ba]!.p0[1]);
  }
  return out;
}

/**
 * The flank re-aim is eased in with a bump that is zero at both rest poses,
 * where the authored flanks must show, and full across the middle where the
 * bulge happens. This is a geometric weight, not a timeline easing.
 */
export const flankAimWeight = (t: number): number => Math.sin(Math.PI * t) ** 2;
/** Weight of the authored art in the handoff blend: full at the rest poses. */
export const handoffWeight = (t: number): number => Math.cos(Math.PI * t) ** 2;

/**
 * Shortens a curve's handles, both together, until the curve no longer
 * loops through itself. A tip curve whose handles reach past each other
 * ties a hairline knot; the rib and flank moves can create one mid-morph
 * even when both rest poses are simple.
 */
export function unknot(c: Cubic): Cubic {
  let cur = c;
  for (let guard = 0; guard < 12 && cubicKnots(cur); guard++) {
    cur = {
      p0: cur.p0,
      c1: [cur.p0[0] + (cur.c1[0] - cur.p0[0]) * 0.8, cur.p0[1] + (cur.c1[1] - cur.p0[1]) * 0.8],
      c2: [cur.p1[0] + (cur.c2[0] - cur.p1[0]) * 0.8, cur.p1[1] + (cur.c2[1] - cur.p1[1]) * 0.8],
      p1: cur.p1,
    };
  }
  return cur;
}

/** A canonical frame before any handoff blend. */
export function canonicalFrame(a: Cubic[], b: Cubic[], t: number): Cubic[] {
  const n1 = Math.floor((a.length - 4) / 2);
  const raw = ribInterpolate(lerpLoops(a, b, t), a, b, t);
  const frame = lerpLoops(raw, alignFlanks(raw, n1), flankAimWeight(t));
  for (const idx of [0, 2 + n1]) if (idx < frame.length) frame[idx] = unknot(frame[idx]!);
  return frame;
}

/**
 * Picks the target's canonical loop from the candidates. Among candidates
 * whose score reaches `thicknessRatio` (they reconstruct the target, do
 * not self-intersect and hold thickness) the one whose anchors travel
 * least from `a` wins: a pairing that trades sides can inflate the
 * mid-morph area, so the largest ratio is not the right pick. When none
 * holds thickness the least-pinching one is kept, so the failure reports
 * how close it came. Ties fall to the earlier candidate.
 */
export function selectCandidate(
  a: Cubic[],
  candidates: Cubic[][],
  score: (b: Cubic[]) => number,
  thicknessRatio: number,
): { candidate: Cubic[]; score: number; travel: number } {
  const travelOf = (b: Cubic[]) => a.reduce((sum, s, i) => sum + dist(s.p0, b[i]!.p0), 0);
  let best = candidates[0]!,
    bestS = score(best),
    bestTravel = travelOf(best);
  for (const cand of candidates.slice(1)) {
    const s = score(cand),
      travel = travelOf(cand);
    const candHolds = s >= thicknessRatio,
      bestHolds = bestS >= thicknessRatio;
    const tie = 1e-9 * Math.max(bestTravel, loopExtent(a));
    const better = candHolds && bestHolds ? travel < bestTravel - tie : candHolds !== bestHolds ? candHolds : s > bestS;
    if (better) {
      best = cand;
      bestS = s;
      bestTravel = travel;
    }
  }
  return { candidate: best, score: bestS, travel: bestTravel };
}

export interface TaperTrack extends SubpathTrack {
  /**
   * The canonical endpoint loops (two tip cubics plus the body anchors).
   * `from` and `to` inherited from the track share the frames' topology,
   * which with the handoff on is a polyline.
   */
  canonicalFrom: Cubic[];
  canonicalTo: Cubic[];
  /** Body anchors per edge in the canonical loops. */
  n1: number;
  /** The canonical frame (six-ish anchors, curved) at `progress`. */
  canonical(progress: number): Cubic[];
  /** Tip points at `progress`, in canonical order. */
  tips(progress: number): [Point, Point];
  /**
   * The two edges at `progress` as polylines of `points` samples each, from
   * tip one to tip two. Edge 0 runs along the first canonical edge.
   */
  edges(progress: number, points: number): [Point[], Point[]];
  /** The thickness ratio the chosen correspondence achieved. */
  thickness: number;
}

export type TaperResult = { ok: true; track: TaperTrack } | { ok: false; failure: MorphFailure };

/**
 * Builds a taper track from two authored closed loops, or reports why it
 * cannot. Preprocessing snaps the seam and smooths anchors as the prototype
 * did before its taper resample. A loop whose two best fold candidates do
 * not both fold sharply, or whose canonical reconstruction does not hold
 * the authored area, is not a taper and fails with `tips-not-found`.
 */
export function taperTrack(fromRaw: Cubic[], toRaw: Cubic[], options: TaperOptions = {}): TaperResult {
  const o = { ...TAPER_DEFAULTS, ...options };
  if (!fromRaw.length || !toRaw.length) {
    return { ok: false, failure: { code: "empty-geometry", message: "both drawings need at least one segment" } };
  }
  const anchors = Math.max(6, o.anchors);
  const handoffPoints = Math.max(8, Math.round(o.handoffPoints));
  const fromTrim = dropZeroSegments(fromRaw),
    toTrim = dropZeroSegments(toRaw);
  const fromArt = snapClosed(fromTrim, o.seamTolerance * new ArcLoop(fromTrim).total),
    toArt = snapClosed(toTrim, o.seamTolerance * new ArcLoop(toTrim).total);
  const open = smoothAnchors(fromArt),
    closed = smoothAnchors(toArt);
  const minFold = (o.tipFoldDegrees * Math.PI) / 180;
  const tipsOpen = findTips(open),
    tipsClosed = findTips(closed);
  for (const [tips, which] of [
    [tipsOpen, "from"],
    [tipsClosed, "to"],
  ] as const) {
    if (Math.min(tips.fold1, tips.fold2) < minFold) {
      return {
        ok: false,
        failure: {
          code: "tips-not-found",
          message: `the ${which} loop has no two tapered tips folding by at least ${o.tipFoldDegrees} degrees`,
        },
      };
    }
  }
  const tipPx = Number.isFinite(o.tipDistance)
    ? o.tipDistance
    : Math.min(taperDistance(open, tipsOpen), taperDistance(closed, tipsClosed));
  const wind = Math.sign(signedArea(open)) || 1;
  const area = (L: Cubic[]) => Math.abs(signedArea(L));
  const faithful = (canon: Cubic[], art: Cubic[]): boolean => {
    const target = area(art);
    return target > 0 && Math.abs(area(canon) - target) <= o.reconstructionTolerance * target;
  };
  const a = canonicalTaper(open, anchors, tipPx, wind, tipsOpen);
  if (!faithful(a, open)) {
    return {
      ok: false,
      failure: { code: "tips-not-found", message: "the from loop's tips do not describe it: the canonical taper does not hold its area" },
    };
  }
  // Correspondence by thickness search: which closed tip is tip one, and
  // which winding, decides whether anchors pair edge-to-edge or trade sides.
  // Among candidates that reconstruct the target, do not self-intersect and
  // hold thickness, the one whose anchors travel least wins: a pairing that
  // trades sides can inflate the mid-morph area, so the largest ratio is
  // not the right pick. When none holds thickness, the least-pinching one
  // is kept so the failure reports how close it came.
  const score = (b: Cubic[]) => {
    if (!faithful(b, closed)) return -2;
    if (o.checkProgress.some((tt) => selfIntersects(canonicalFrame(a, b, tt)))) return -1;
    const lo = Math.min(area(a), area(b)) || 1;
    return Math.min(...[0.25, 0.5, 0.75].map((tt) => area(canonicalFrame(a, b, tt)) / lo));
  };
  const candidates: Cubic[][] = [canonicalTaper(closed, anchors, tipPx, wind, tipsClosed)];
  for (const ref of [tipsOpen.p1, tipsOpen.p2]) {
    for (const w of [wind, -wind]) candidates.push(canonicalTaper(closed, anchors, tipPx, w, tipsClosed, ref));
  }
  const chosen = selectCandidate(a, candidates, score, o.thicknessRatio);
  const b = chosen.candidate,
    bestS = chosen.score;
  const n1 = canonLayout(anchors).n1;
  if (bestS <= -2) {
    return {
      ok: false,
      failure: { code: "tips-not-found", message: "the to loop's tips do not describe it: the canonical taper does not hold its area" },
    };
  }
  if (bestS < 0) {
    return {
      ok: false,
      failure: {
        code: "self-intersection",
        message: "every taper correspondence self-intersects mid-morph",
        progress: o.checkProgress.filter((tt) => selfIntersects(canonicalFrame(a, b, tt))),
      },
    };
  }
  if (bestS < o.thicknessRatio) {
    return {
      ok: false,
      failure: {
        code: "thickness",
        message: `mid-morph area falls to ${bestS.toFixed(3)} of the thinner endpoint, below ${o.thicknessRatio}`,
      },
    };
  }
  const canonical = (t: number) => canonicalFrame(a, b, clamp01(t));
  const tips = (t: number): [Point, Point] => {
    const fr = canonical(t);
    return [evalCubic(fr[0]!, 0.5), evalCubic(fr[2 + n1]!, 0.5)];
  };
  // The handoff polylines share a winding and all start at tip one, so
  // index i of the art, the target and the canonical frame sit at the same
  // place along the ribbon whatever way it points.
  const poly = (loop: Cubic[], tip: Point) => {
    const L = withWinding(loop, 1);
    return loopToPolyline(L, handoffPoints, nearestFraction(L, tip));
  };
  const O = o.handoff ? poly(fromArt, tips(0)[0]) : null;
  const C = o.handoff ? poly(toArt, tips(1)[0]) : null;
  const frame = (tRaw: number): Cubic[] => {
    const t = clamp01(tRaw);
    const fr = canonical(t);
    if (!O || !C) return fr;
    const w = handoffWeight(t);
    const TP = poly(fr, tips(t)[0]);
    const pts: Point[] = TP.map((p, i) => {
      const ox = O[i]![0] + (C[i]![0] - O[i]![0]) * t,
        oy = O[i]![1] + (C[i]![1] - O[i]![1]) * t;
      return [p[0] * (1 - w) + ox * w, p[1] * (1 - w) + oy * w];
    });
    return polylineLoop(pts);
  };
  const edges = (t: number, points: number): [Point[], Point[]] => {
    const fr = canonical(t);
    const [T1, T2] = tips(t);
    const inner = Math.max(2, points - 2);
    // Segment 0 is tip one, segments 1..1+n1 are edge one from tip one's
    // flank to tip two's flank, segment 2+n1 is tip two, and the rest is
    // edge two from tip two's flank back to tip one's flank.
    const e1 = [T1, ...chainToPolyline(fr.slice(1, 2 + n1), inner), T2];
    const e2 = [T2, ...chainToPolyline(fr.slice(3 + n1), inner), T1];
    return [e1, e2.reverse()];
  };
  // `from` and `to` share the frames' topology: with the handoff on they
  // are the rest-pose polylines, otherwise the canonical loops themselves.
  return {
    ok: true,
    track: {
      from: O && C ? frame(0) : a,
      to: O && C ? frame(1) : b,
      canonicalFrom: a,
      canonicalTo: b,
      frame,
      canonical,
      tips,
      edges,
      n1,
      thickness: bestS,
    },
  };
}

/** Loop fraction of the point nearest `target`: a shared phase for handoff blends. */
function nearestFraction(loop: Cubic[], target: Point): number {
  const arc = new ArcLoop(loop);
  let lf = 0,
    best = Infinity;
  for (let k = 0; k < 480; k++) {
    const f = k / 480,
      d = dist(arc.pointAt(f), target);
    if (d < best) {
      best = d;
      lf = f;
    }
  }
  return lf;
}
