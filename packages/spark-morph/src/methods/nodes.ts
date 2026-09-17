import { clamp01, closeLoop, copyLoop, dist, lerpLoops, lerpLoopsAngular, selfIntersects, signedArea, withWinding } from "../geometry/cubic";
import type { Cubic, MorphFailure, SubpathTrack } from "../types";

export interface NodesOptions {
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

export const NODES_DEFAULTS: Required<NodesOptions> = {
  handles: "angular",
  checkProgress: [],
};

export interface NodesTrack extends SubpathTrack {
  /** Whether the target was reversed to match the source winding. */
  reversed: boolean;
  /** The rotation applied to the target's node order. */
  rotation: number;
}

export type NodesResult = { ok: true; track: NodesTrack } | { ok: false; failure: MorphFailure };

/**
 * Pairs node with node by index. Both drawings must have the same number of
 * nodes; the target is reversed to the source winding if drawn the other
 * way and rotated to the node order with the least total travel, so an
 * export that re-ordered the path start still pairs as the artist drew it.
 * Anchors and handles then interpolate directly: a straight edge stays
 * straight and a corner stays a corner.
 */
export function nodesTrack(fromRaw: Cubic[], toRaw: Cubic[], options: NodesOptions = {}): NodesResult {
  const o = { ...NODES_DEFAULTS, ...options };
  if (!fromRaw.length || !toRaw.length) {
    return { ok: false, failure: { code: "empty-geometry", message: "both drawings need at least one segment" } };
  }
  const from = closeLoop(fromRaw),
    toClosed = closeLoop(toRaw);
  if (from.length !== toClosed.length) {
    return {
      ok: false,
      failure: {
        code: "node-count",
        message: `the drawings have ${from.length} and ${toClosed.length} nodes; the nodes method needs the same nodes in the same order`,
      },
    };
  }
  const wind = Math.sign(signedArea(from)) || 1;
  const to = withWinding(toClosed, wind);
  const reversed = to !== toClosed;
  const n = from.length;
  let rotation = 0,
    best = Infinity;
  for (let k = 0; k < n; k++) {
    let travel = 0;
    for (let i = 0; i < n; i++) travel += dist(from[i]!.p0, to[(i + k) % n]!.p0);
    if (travel < best - 1e-9) {
      best = travel;
      rotation = k;
    }
  }
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
