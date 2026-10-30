// The morph bake's cross-host protocol: what compilation emits (recipes and
// compact references), what a bake produces (artifacts) and what it reports
// (diagnostics). Everything here is plain JSON so it can cross a worker,
// service-worker or webview boundary unchanged. README.md beside this file
// describes the protocol in prose.

/**
 * Bumped whenever a bake would produce a different artifact from the same
 * inputs, so every cache keyed by it misses rather than serving the old
 * output.
 */
export const MORPH_BAKE_FORMAT = 19;

export type MorphBlend = "morph" | "fade" | "cut" | "scale";
export type MorphFallback = "fade" | "cut" | "scale";
export type MorphMethodName = "match" | "bend" | "trace";

export interface MorphPolicy {
  blend?: MorphBlend;
  method?: MorphMethodName;
  fallback?: MorphFallback;
  /**
   * The pose whose stacking a moving shape keeps between keyframes: `rest`,
   * or a group-qualified state such as `eyes.closed`.
   */
  depth?: string;
  partner?: string[];
}

/**
 * Everything a bake needs from a morph declaration, after inheritance. It is
 * the same for every image variant the morph plays on; a variant's own rest
 * is resolved during the bake from its selection. Timing and layer poses are
 * left out: they drive playback, and changing them must not invalidate baked
 * geometry.
 */
export interface MorphRecipe {
  name: string;
  blend: MorphBlend;
  method?: MorphMethodName;
  fallback: MorphFallback;
  /** The root's `depth` (`MorphPolicy.depth`); absent when it is `rest`. */
  depth?: string;
  /** Per-label overrides, keys sorted. */
  layers: Record<string, MorphPolicy>;
  /**
   * The keyframes' state selections in offset order: only the groups each
   * keyframe sets a `state` for. A keyframe that sets none is kept, so the
   * first keyframe still says which groups the morph starts from.
   */
  keyframes: { offset: number; states: Record<string, string> }[];
  clips: { between: string[]; targets: string[] }[];
  /** The `paints` entries in authored order; absent when there are none. */
  paints?: MorphPaintEntry[];
}

/**
 * One `paints` entry: the colour the drawings of `targets` take at the pose
 * `state` names, in variants whose rest pose draws a layer that needs `when`.
 * Colours are written as `formatColor` writes them, so equal colours give one
 * recipe text.
 */
export interface MorphPaintEntry {
  targets: string[];
  /** A group-qualified state of a group the morph drives, such as `eyes.closed`. */
  state: string;
  /** A group-qualified state of a group the morph does not drive, such as `mask.on`. */
  when?: string;
  fill?: string;
  stroke?: string;
  opacity?: number;
  /** How much of each segment next to the pose the change takes, from 0 to 1. */
  span: number;
}

/**
 * The compact reference compilation emits for one image variant a morph plays
 * on. It names the artifact rather than carrying it: frames and resources live
 * in the bake cache of whichever host resolves it.
 */
export interface MorphRef {
  /** The morph declaration's name; its recipe is `program.morphs.recipes[morph]`. */
  morph: string;
  /**
   * Identity of the artifact: it changes whenever the source version, the
   * variant's selection, the recipe or the bake format changes, so a
   * consumer can tell a late result for an older generation from the one it
   * is waiting for.
   */
  key: string;
  /** The root image's context key. */
  image: string;
  /** The variant's canonical attribute selection, as JSON. */
  selection: string;
  /** The groups the morph drives on this variant. */
  groups: string[];
  /**
   * The artifact's URL on hosts whose asset service bakes (the web service
   * worker). Absent when the source is inline in the program, where the
   * consumer bakes in-process.
   */
  src?: string;
}

/**
 * When a morph plays, with its defaults applied: what a player schedules an
 * occurrence by (`timeline.ts`). Not part of the recipe, so retiming a morph
 * bakes nothing again.
 */
export interface MorphTiming {
  /** Seconds one play lasts. */
  duration: number;
  /** Seconds before the first play. */
  delay: number;
  /** A CSS timing function, applied once to each play's directed progress. */
  easing: string;
  /** Plays, or `infinite`; `0` never plays. */
  iterations: number | "infinite";
  direction: "normal" | "reverse" | "alternate" | "alternate-reverse";
  /** Shortest quiet time between plays, in seconds; set with the max. */
  iteration_delay_min?: number;
  /** Longest quiet time between plays, in seconds; set with the min. */
  iteration_delay_max?: number;
}

/** The program channel compilation fills; see `SparkProgram.morphs`. */
export interface MorphProgramChannel {
  /** Each morph's recipe as canonical JSON (`serializeMorphRecipe`). */
  recipes: Record<string, string>;
  /** References by the variant's context key (the `filtered_image` name). */
  variants: Record<string, MorphRef[]>;
}

export type MorphDiagnosticCode =
  | "method-failed"
  | "missing-method"
  | "pairing-count"
  | "edge-not-bend"
  | "edge-missing"
  | "edge-compound"
  | "aperture-ambiguous"
  | "aperture-unpaired"
  | "aperture-degenerate"
  | "clip-self-dependent"
  | "target-missing"
  | "mixed-groups"
  | "unsupported-transform"
  | "unsupported-element"
  | "resource-missing"
  | "source-unreadable"
  | "inactive-variant"
  | "depth-ignored"
  | "paint-target-missing"
  | "partner-missing";

export interface MorphBakeDiagnostic {
  code: MorphDiagnosticCode;
  severity: "warning" | "error";
  message: string;
  /**
   * The artwork's URI and the variant's context key for the consumer the
   * bake ran for. Consumers sharing the artifact's key share its diagnostics;
   * a host reporting them binds each to its own artwork and variant.
   */
  uri?: string;
  morph: string;
  variant?: string;
  /** The layer label or element the problem is about. */
  layer?: string;
  /** The vocabulary key of the element, when it has one. */
  path?: string;
}

/**
 * One ordered render part. Parts paint bottom to top; a static part never
 * changes, and a live part holds the state layers and clip targets the
 * player animates. Each part is a complete SVG document with the root's
 * sizing and every resource it references, ids namespaced under the
 * artifact's `idPrefix`. A live part is written in the rest pose: its leaves
 * carry `data-morph` node ids, and those other states show carry an inline
 * `display: none`, so the parts composed as written are the rest render.
 * (Artwork carrying a style sheet is never baked live, so nothing outranks
 * that declaration.)
 */
export interface MorphPart {
  kind: "static" | "live";
  svg: string;
}

/**
 * Precomputed frames of one moving drawing, in its element's own user space.
 * Every frame shares one layout, so a player blends two neighbouring frames
 * number by number.
 */
export interface MorphFrames {
  /** Frames evenly spaced over progress 0 to 1 inclusive. */
  count: number;
  segmentCounts: number[];
  closed: boolean[];
  /**
   * Every subpath of every frame is a closed polyline: each segment is
   * stored as its start point alone, and each subpath closes back to its
   * first point.
   */
  lines?: boolean;
  /**
   * `count` flat arrays: each segment as p0, c1, c2, p1 x/y pairs, or as p0
   * alone when `lines` is set.
   */
  frames: number[][];
}

/**
 * A reference into one of the artifact's geometry tables. `reversed` plays
 * the entry from its last sample to its first: a segment that moves the same
 * two drawings the other way reuses the geometry of the one before it.
 */
export interface MorphGeometryRef {
  index: number;
  reversed: boolean;
}

/**
 * How one drawing gets from a segment's start pose to its end pose. Nodes are
 * the `data-morph` ids of leaf elements in the live parts; frames are entries
 * of the artifact's `frames` table, in the node's own user space.
 *
 * - `morph`: between the ends the `draw` node's geometry follows the frames,
 *   and its paint blends `paint`'s two ends and `gradients`', then the `to`
 *   node takes over. The moving drawing paints at the depth
 *   its layer has in the pose its `depth` names (the variant's rest pose by
 *   default): `draw` is whichever of `from` and `to` that pose shows, or,
 *   for a named pose that shows neither, a hidden carrier of that pose's
 *   drawing of the same label; where the pose places neither, the rest pose
 *   decides, and `draw` is `from` when it shows neither. A second track
 *   drawing on the same node, and every track of a basic shape, draws on a
 *   hidden carrier copied right after it. `shared` marks a drawing several
 *   tracks share; it is drawn once at its end.
 * - `fade`: `from` fades out while `to` fades in; either may be absent.
 * - `cut`: `from` holds until the segment ends, then `to` shows.
 * - `scale`: `node` shrinks to (or grows from) its own fixed centre; the zero
 *   endpoint is invisible, the full one is `node` itself, and between them
 *   the `draw` node follows the frames: `node` for a path, a hidden carrier
 *   copied right after it for a basic shape.
 * - `hold`: a clip-controlled backing node stays drawn through the whole
 *   segment, so the moving aperture alone decides what shows.
 */
export type MorphTransition =
  | {
      kind: "morph";
      from: string;
      to: string;
      draw: string;
      shared: boolean;
      frames: MorphGeometryRef;
      paint?: MorphPaint;
      gradients?: { fill?: MorphGradientBlend; stroke?: MorphGradientBlend };
      partner?: true;
    }
  | { kind: "fade"; from?: string; to?: string }
  | { kind: "cut"; from?: string; to?: string }
  | { kind: "scale"; node: string; draw: string; direction: "shrink" | "grow"; frames: MorphGeometryRef }
  | { kind: "hold"; node: string };

/** Red, green and blue from 0 to 255 and alpha from 0 to 1, in gamma-encoded sRGB. */
export type MorphColor = [number, number, number, number];

/**
 * A moving drawing's solid paint at the segment's start and end, `[from,
 * to]`, for each property the `draw` node does not already show at both
 * ends: where `from`, `to` and the drawing `draw` copies disagree. Each value
 * is the drawing's effective one (its own declaration, else what it
 * inherits, else the SVG initial value). A `none` fill or stroke is the
 * other end's colour at zero alpha. A fill or stroke either end paints with
 * something other than a colour (a paint server) records neither it nor its
 * opacity, unless both ends' gradients blend (the transition's `gradients`),
 * which records its opacity.
 */
export interface MorphPaint {
  fill?: [MorphColor, MorphColor];
  stroke?: [MorphColor, MorphColor];
  "fill-opacity"?: [number, number];
  "stroke-opacity"?: [number, number];
  opacity?: [number, number];
}

/**
 * One end of a gradient a moving drawing's fill or stroke blends, resolved
 * through its `href` chain, in the user space of the node the shape draws
 * on: a `userSpaceOnUse` gradient's `transform` maps it there from the end's
 * own drawing; an `objectBoundingBox` one keeps its unit coordinates and
 * follows the moving shape's box.
 */
export interface MorphGradient {
  kind: "linear" | "radial";
  units: "userSpaceOnUse" | "objectBoundingBox";
  spread: "pad" | "reflect" | "repeat";
  /** `x1 y1 x2 y2` for a linear gradient, `cx cy r fx fy fr` for a radial one. */
  geometry: number[];
  /** The `gradientTransform`, `[a, b, c, d, e, f]`. */
  transform: number[];
  /** Each stop's offset and colour, its `stop-opacity` folded into the alpha. */
  stops: [number, MorphColor][];
}

/**
 * A gradient a moving drawing's fill or stroke blends between its two
 * drawings: `id` is the copy of it in the live part (before occurrence
 * namespacing) that the `draw` node paints with between the ends, and `ends`
 * are the two drawings' gradients, of the same kind, units, spread and stop
 * count.
 */
export interface MorphGradientBlend {
  id: string;
  ends: [MorphGradient, MorphGradient];
}

/** A drawing's own fill and stroke colours, where the bake reads them; `none` is the entry's colour at zero alpha. */
export interface MorphPaintBase {
  fill?: MorphColor;
  stroke?: MorphColor;
  opacity?: number;
}

/**
 * A `paints` entry where it applies to the variant: the colour the drawings
 * of its labels take at one pose of `group`. `nodes` are the pose's own
 * target drawings; `tracks` are the `morph` tracks of the segments arriving
 * at or leaving the pose whose end there is one of them, by the node each
 * draws on, with the paint the track shows at its two ends without the entry.
 * A property the bake cannot read for a drawing or track (a paint server) is
 * left out of its record.
 */
export interface MorphPaintPose {
  group: string;
  state: string;
  /** How much of each segment next to the pose the change takes, from 0 to 1. */
  span: number;
  fill?: MorphColor;
  stroke?: MorphColor;
  opacity?: number;
  nodes: Record<string, MorphPaintBase>;
  tracks: {
    segment: number;
    draw: string;
    ends: { fill?: [MorphColor, MorphColor]; stroke?: [MorphColor, MorphColor]; opacity?: [number, number] };
  }[];
}

/** One clip entry's aperture through a segment: an `apertures` table entry. */
export interface MorphClipFrames {
  clip: number;
  loops: MorphGeometryRef;
  /**
   * Per aperture (`MorphClipTarget.aperture`), the loops whose two moving
   * edges both paint above the aperture's target in this segment, and so
   * hide a reach past those loops between the segment's ends
   * (`apertureReachPathData`). An aperture not listed has no reach.
   */
  reach?: { aperture: string; loops: number[] }[];
}

/** One group moving from one state to the next between two keyframe offsets. */
export interface MorphSegment {
  group: string;
  from: { offset: number; state: string };
  to: { offset: number; state: string };
  transitions: MorphTransition[];
  clips: MorphClipFrames[];
  shapes?: Record<string, string>;
  carry?: { from?: Record<string, string>; to?: Record<string, string> };
}

/** A clip target's wrapper in a live part, and the matrix from root space into the space the target is drawn in. */
export interface MorphClipTarget {
  clip: number;
  /**
   * The id (before occurrence namespacing) of the wrapper's aperture: a
   * `mask`, or a `clipPath` where the bake keeps it in the target's parent
   * space.
   */
  aperture: string;
  /** Root user space to the target's parent's user space, `[a, b, c, d, e, f]`. */
  matrix: number[];
}

export interface MorphArtifact {
  format: number;
  key: string;
  morph: string;
  variant?: string;
  /**
   * `live`: parts and segments animate the variant. `static`: the morph does
   * not play on it (diagnostics say why) and `rest` is the plain static
   * render, the stable fallback.
   */
  status: "live" | "static";
  /** Root sizing, copied onto every part so they overlay exactly. */
  viewBox?: string;
  width?: string;
  height?: string;
  /**
   * The static render at rest with every clip entry's rest aperture applied:
   * what hovers, previews and shadow masks show for this variant.
   */
  rest: string;
  /**
   * The prefix every id in `parts` starts with, unique to the artifact. A
   * player drawing several copies inline replaces it per copy
   * (`namespaceMorphMarkup`). `rest` is a standalone image and keeps the
   * artwork's own ids.
   */
  idPrefix: string;
  parts: MorphPart[];
  /**
   * Per driven group, the leaf nodes visible in each of its states. Nodes
   * outside every group (clip targets that are not state layers) are always
   * visible.
   */
  visibility: Record<string, Record<string, string[]>>;
  /** Per driven group, its keyframes with the variant's concrete states. */
  schedules: Record<string, { offset: number; state: string }[]>;
  segments: MorphSegment[];
  /** Geometry table for `morph` and `scale` transitions. */
  frames: MorphFrames[];
  /**
   * Aperture table: per entry, per sample, the union's loops in root user
   * space as flat x, y arrays.
   */
  apertures: number[][][][];
  /**
   * Beside each aperture table entry, per sample and per loop, the drawings
   * of the two edges that bound that loop, each a closed loop in root user
   * space as a flat x, y array: where the aperture may reach away from rest
   * (`apertureReachPathData`).
   */
  apertureEdges: number[][][][][];
  clipTargets: MorphClipTarget[];
  /** The `paints` entries that apply to the variant, in authored order; absent when none does. */
  paints?: MorphPaintPose[];
  diagnostics: MorphBakeDiagnostic[];
}
