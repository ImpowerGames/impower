import { copyLoop, sameLoop } from "./geometry/cubic";
import { type RibbonOptions, ribbonTrack } from "./methods/ribbon";
import { type ScaleTrack, scaleTrack } from "./methods/scale";
import { type ShapeOptions, shapeTrack } from "./methods/shape";
import type { Cubic, MorphMethod, MorphResult, Subpath, SubpathMorph, SubpathTrack } from "./types";

export interface MorphOptions {
  /** The explicit method. A failure is reported, never swapped for the other. */
  method: MorphMethod;
  ribbon?: RibbonOptions;
  shape?: ShapeOptions;
  /** Per-control-point tolerance under which two drawings count as identical. */
  stillTolerance?: number;
}

const stillTrack = (loop: Cubic[]): SubpathTrack => {
  const keep = copyLoop(loop);
  return { from: keep, to: keep, frame: () => copyLoop(keep) };
};

const toSubpath = (segments: Cubic[]): Subpath => ({ segments, closed: true });

/**
 * Morphs two drawings with the chosen method. Compound drawings pair their
 * subpaths in document order and only when the counts match. A subpath
 * identical in both drawings stays still. Any subpath the method cannot
 * handle fails the whole morph with the offending index, so the caller can
 * apply its selected fallback.
 */
export function morphSubpaths(from: Subpath[], to: Subpath[], options: MorphOptions): MorphResult {
  if (!from.length || !to.length) {
    return { ok: false, failure: { code: "empty-geometry", message: "both drawings need at least one subpath" } };
  }
  if (from.length !== to.length) {
    return {
      ok: false,
      failure: {
        code: "subpath-count",
        message: `the drawings have ${from.length} and ${to.length} subpaths; compound drawings pair only with equal counts`,
      },
    };
  }
  const tracks: SubpathTrack[] = [];
  let moving = 0;
  for (let i = 0; i < from.length; i++) {
    const a = from[i]!.segments,
      b = to[i]!.segments;
    if (!a.length || !b.length) {
      return { ok: false, failure: { code: "empty-geometry", message: `subpath ${i} has no segments`, subpath: i } };
    }
    if (sameLoop(a, b, options.stillTolerance)) {
      tracks.push(stillTrack(a));
      continue;
    }
    moving++;
    const result = options.method === "ribbon" ? ribbonTrack(a, b, options.ribbon) : shapeTrack(a, b, options.shape);
    if (!result.ok) return { ok: false, failure: { ...result.failure, subpath: i } };
    tracks.push(result.track);
  }
  const morph: SubpathMorph = {
    method: moving ? options.method : "still",
    tracks,
    from,
    to,
    frame: (t) => tracks.map((tr) => toSubpath(tr.frame(t))),
  };
  return { ok: true, morph };
}

export interface ScaleMorph extends SubpathMorph {
  method: "scale";
  tracks: ScaleTrack[];
  visible(progress: number): boolean;
}

/**
 * The `scale` transition for a drawing with no counterpart: each subpath
 * grows from, or shrinks to, its own fixed centre. The zero endpoint is
 * invisible and the full endpoint is the authored drawing exactly.
 */
export function morphScale(shape: Subpath[], direction: "grow" | "shrink"): ScaleMorph {
  const tracks = shape.map((s) => scaleTrack(s.segments, direction));
  const zero: Subpath[] = shape.map((s, i) => ({ segments: tracks[i]!.frame(direction === "grow" ? 0 : 1), closed: s.closed }));
  return {
    method: "scale",
    tracks,
    from: direction === "grow" ? zero : shape,
    to: direction === "grow" ? shape : zero,
    frame: (t) => tracks.map((tr, i) => ({ segments: tr.frame(t), closed: shape[i]!.closed })),
    visible: (t) => tracks.some((tr) => tr.visible(t)),
  };
}
