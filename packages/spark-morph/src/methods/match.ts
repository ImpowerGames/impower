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

export function prepareLoop(raw: Cubic[], seamTolerance: number): Cubic[] {
  const trimmed = dropZeroSegments(raw);
  return closeLoop(snapClosed(trimmed, seamTolerance * new ArcLoop(trimmed).total));
}

export interface MatchOptions {
  seamTolerance?: number;
  handles?: "angular" | "linear";
  checkProgress?: number[];
}

export const MATCH_DEFAULTS: Required<MatchOptions> = {
  seamTolerance: 0.02,
  handles: "angular",
  checkProgress: [],
};

export interface MatchTrack extends SubpathTrack {
  reversed: boolean;
  rotation: number;
}

export type MatchResult = { ok: true; track: MatchTrack } | { ok: false; failure: MorphFailure };

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
