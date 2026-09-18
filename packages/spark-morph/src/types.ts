/** A point in user units: `[x, y]`. */
export type Point = [number, number];

/**
 * One cubic Bezier segment with absolute coordinates. Straight lines are
 * cubics whose handles sit on their endpoints (`c1 === p0`, `c2 === p1`).
 */
export interface Cubic {
  p0: Point;
  c1: Point;
  c2: Point;
  p1: Point;
}

/**
 * A subpath of a path: one `M` and everything up to the next `M`. `closed`
 * records whether the author wrote `Z`; the segment list of a closed subpath
 * always ends where it started.
 */
export interface Subpath {
  segments: Cubic[];
  closed: boolean;
}

/**
 * The explicit interpolation methods, each named by what it pairs on. There
 * is no automatic selection.
 *
 * - `nodes` pairs node with node by index: the second pose was drawn by
 *   editing a copy of the first, so both have the same nodes in the same
 *   order, and the artist controls the motion through node placement.
 * - `taper` pairs tip with tip and edge with edge: a thin closed loop with
 *   two pointed ends, such as a lash or a crease.
 * - `trace` pairs the drawings' anchors along the outline, inserting a
 *   dissolved node where one drawing has a corner the other lacks: any
 *   closed shape.
 */
export type MorphMethod = "nodes" | "taper" | "trace";

/** Why a method could not produce a usable morph for the given geometry. */
export type MorphFailureCode =
  | "empty-geometry"
  | "subpath-count"
  | "not-closed"
  | "node-count"
  | "tips-not-found"
  | "self-intersection"
  | "thickness";

export interface MorphFailure {
  code: MorphFailureCode;
  message: string;
  /** Index of the offending subpath pair, when the failure is local to one. */
  subpath?: number;
  /** The progress values at which a quality check failed, when applicable. */
  progress?: number[];
}

/**
 * The per-subpath interpolator a method produces. `from` and `to` are the
 * topology-compatible endpoint loops the method interpolates between; the
 * frame at any progress has the same segment count as both.
 */
export interface SubpathTrack {
  from: Cubic[];
  to: Cubic[];
  /** The frame at `progress` in [0, 1]. No timing easing is applied here. */
  frame(progress: number): Cubic[];
}

export interface SubpathMorph {
  method: MorphMethod | "still" | "scale";
  tracks: SubpathTrack[];
  /** The authored endpoints, untouched, for callers that render them directly. */
  from: Subpath[];
  to: Subpath[];
  /** The frame at `progress`, one closed subpath per track. */
  frame(progress: number): Subpath[];
}

export type MorphResult =
  | { ok: true; morph: SubpathMorph }
  | { ok: false; failure: MorphFailure };
