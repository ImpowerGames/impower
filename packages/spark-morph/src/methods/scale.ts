import { anchorMean, clamp01, copyLoop, lerpLoops } from "../geometry/cubic";
import type { Cubic, Point, SubpathTrack } from "../types";

export interface ScaleTrack extends SubpathTrack {
  center: Point;
  visible(progress: number): boolean;
}

export function collapsedLoop(loop: Cubic[], center: Point): Cubic[] {
  return loop.map(() => ({
    p0: [center[0], center[1]],
    c1: [center[0], center[1]],
    c2: [center[0], center[1]],
    p1: [center[0], center[1]],
  }));
}

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
