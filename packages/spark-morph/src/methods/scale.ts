import { anchorMean, clamp01, copyLoop, lerpLoops } from "../geometry/cubic";
import type { Cubic, Point, SubpathTrack } from "../types";

export interface ScaleTrack extends SubpathTrack {
  /** The fixed collapse centre: the mean of the loop's segment start points. */
  center: Point;
  /** Whether the frame at `progress` has any extent; the zero endpoint is invisible. */
  visible(progress: number): boolean;
}

/**
 * Collapses a loop to its centre with every control point at that point.
 * Interpolating from it scales the drawing about a fixed centre.
 */
export function collapsedLoop(loop: Cubic[], center: Point): Cubic[] {
  return loop.map(() => ({
    p0: [center[0], center[1]],
    c1: [center[0], center[1]],
    c2: [center[0], center[1]],
    p1: [center[0], center[1]],
  }));
}

/**
 * A track that grows a loop from nothing (`direction: "grow"`, zero at
 * progress 0) or shrinks it to nothing (`"shrink"`, zero at progress 1)
 * about a fixed centre. The full endpoint is returned exactly as authored,
 * not through arithmetic that could round.
 */
export function scaleTrack(loop: Cubic[], direction: "grow" | "shrink"): ScaleTrack {
  const center = anchorMean(loop);
  const full = copyLoop(loop);
  const zero = collapsedLoop(loop, center);
  const from = direction === "grow" ? zero : full;
  const to = direction === "grow" ? full : zero;
  const zeroAt = direction === "grow" ? 0 : 1;
  const frame = (tRaw: number): Cubic[] => {
    const t = clamp01(tRaw);
    if (t === zeroAt) return copyLoop(zero);
    if (t === 1 - zeroAt) return copyLoop(full);
    return lerpLoops(from, to, t);
  };
  return { from, to, frame, center, visible: (t) => clamp01(t) !== zeroAt };
}
