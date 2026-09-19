import {
  ArcLoop,
  clamp01,
  closeLoop,
  copyLoop,
  dist,
  dropZeroSegments,
  lerpLoops,
  lerpLoopsAngular,
  loopExtent,
  selfIntersects,
  signedArea,
  snapClosed,
  withWinding,
} from "../geometry/cubic";
import type { Cubic, MorphFailure, SubpathTrack } from "../types";

/**
 * Cleans an authored loop for pairing: drops coincident anchors, snaps a
 * seam within `seamTolerance` of the perimeter onto the start, and closes
 * what remains. A gap wider than the tolerance becomes a closing edge.
 */
export function prepareLoop(raw: Cubic[], seamTolerance: number): Cubic[] {
  const trimmed = dropZeroSegments(raw);
  return closeLoop(snapClosed(trimmed, seamTolerance * new ArcLoop(trimmed).total));
}

export interface MatchOptions {
  /**
   * A nearly closed loop's ends are snapped together when within this
   * fraction of its perimeter, so the seam never becomes an extra node.
   */
  seamTolerance?: number;
  /**
   * `angular` rotates each handle's direction and blends its length, so a
   * smooth node never kinks; `linear` blends handle points directly.
   */
  handles?: "angular" | "linear";
  /**
   * Progress values at which self-intersection is reported as a failure.
   * Empty by default: the artist authored the correspondence, and a
   * deliberate overlap is theirs to keep.
   */
  checkProgress?: number[];
}

export const MATCH_DEFAULTS: Required<MatchOptions> = {
  seamTolerance: 0.02,
  handles: "angular",
  checkProgress: [],
};

export interface MatchTrack extends SubpathTrack {
  /** Whether the target was reversed to match the source winding. */
  reversed: boolean;
  /** The rotation applied to the target's node order. */
  rotation: number;
}

export type MatchResult = { ok: true; track: MatchTrack } | { ok: false; failure: MorphFailure };

/**
 * Pairs node with node by index. Both drawings must have the same number of
 * nodes; the target is reversed to the source winding if drawn the other
 * way and rotated to the node order with the least total travel, so an
 * export that re-ordered the path start still pairs as the artist drew it.
 * Anchors and handles then interpolate directly: a straight edge stays
 * straight and a corner stays a corner.
 */
export function matchTrack(fromRaw: Cubic[], toRaw: Cubic[], options: MatchOptions = {}): MatchResult {
  const o = { ...MATCH_DEFAULTS, ...options };
  if (!fromRaw.length || !toRaw.length) {
    return { ok: false, failure: { code: "empty-geometry", message: "both drawings need at least one segment" } };
  }
  const from = prepareLoop(fromRaw, o.seamTolerance),
    toClosed = prepareLoop(toRaw, o.seamTolerance);
  if (from.length !== toClosed.length) {
    return {
      ok: false,
      failure: {
        code: "node-count",
        message: `the drawings have ${from.length} and ${toClosed.length} nodes; the match method needs the same nodes in the same order`,
      },
    };
  }
  const wind = Math.sign(signedArea(from)) || 1;
  const to = withWinding(toClosed, wind);
  const reversed = to !== toClosed;
  const n = from.length;
  // Ties between rotations resolve to the earlier one, judged relative to
  // the travel itself so the choice does not depend on the drawing's units.
  const travels: number[] = [];
  for (let k = 0; k < n; k++) {
    let travel = 0;
    for (let i = 0; i < n; i++) travel += dist(from[i]!.p0, to[(i + k) % n]!.p0);
    travels.push(travel);
  }
  const least = Math.min(...travels);
  const rotation = travels.findIndex((travel) => travel <= least + 1e-9 * Math.max(least, loopExtent(from)));
  const b = to.slice(rotation).concat(to.slice(0, rotation));
  const blend = o.handles === "angular" ? lerpLoopsAngular : lerpLoops;
  // The rest poses are the authored loops themselves, not a blend that
  // could pick up rounding from the handle rotation.
  const frame = (tRaw: number) => {
    const t = clamp01(tRaw);
    if (t <= 0) return copyLoop(from);
    if (t >= 1) return copyLoop(b);
    return blend(from, b, t);
  };
  const bad = o.checkProgress.filter((t) => selfIntersects(frame(t)));
  if (bad.length) {
    return {
      ok: false,
      failure: { code: "self-intersection", message: `the node correspondence self-intersects at progress ${bad.join(", ")}`, progress: bad },
    };
  }
  return { ok: true, track: { from, to: b, frame, reversed, rotation } };
}
