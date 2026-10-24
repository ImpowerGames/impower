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
export const MORPH_BAKE_FORMAT = 1;

export type MorphBlend = "morph" | "fade" | "cut" | "scale";
export type MorphFallback = "fade" | "cut" | "scale";
export type MorphMethodName = "match" | "bend" | "trace";

export interface MorphPolicy {
  blend?: MorphBlend;
  method?: MorphMethodName;
  fallback?: MorphFallback;
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
  /** Per-label overrides, keys sorted. */
  layers: Record<string, MorphPolicy>;
  /**
   * The keyframes' state selections in offset order: only the groups each
   * keyframe sets a `state` for. A keyframe that sets none is kept, so the
   * first keyframe still says which groups the morph starts from.
   */
  keyframes: { offset: number; states: Record<string, string> }[];
  clips: { between: string[]; targets: string[] }[];
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
  | "inactive-variant";

export interface MorphBakeDiagnostic {
  code: MorphDiagnosticCode;
  severity: "warning" | "error";
  message: string;
  /** The artwork's URI, when the host knows it. */
  uri?: string;
  morph: string;
  /** The variant's context key. */
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
 * carry `data-morph` node ids, and those other states show carry
 * `display="none"`, so the parts composed as written are the rest render.
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
 *   then the `to` node takes over. `draw` is `from`, unless several tracks
 *   leave one drawing (a closed lash opening into two): then each track
 *   draws on its own `to`. `shared` marks a drawing several tracks share; it
 *   is drawn once at its end.
 * - `fade`: `from` fades out while `to` fades in; either may be absent.
 * - `cut`: `from` holds until the segment ends, then `to` shows.
 * - `scale`: `node` shrinks to (or grows from) its own fixed centre; the zero
 *   endpoint is invisible.
 * - `hold`: a clip-controlled backing node stays drawn through the whole
 *   segment, so the moving aperture alone decides what shows.
 */
export type MorphTransition =
  | { kind: "morph"; from: string; to: string; draw: string; shared: boolean; frames: MorphGeometryRef }
  | { kind: "fade"; from?: string; to?: string }
  | { kind: "cut"; from?: string; to?: string }
  | { kind: "scale"; node: string; direction: "shrink" | "grow"; frames: MorphGeometryRef }
  | { kind: "hold"; node: string };

/** One clip entry's aperture through a segment: an `apertures` table entry. */
export interface MorphClipFrames {
  clip: number;
  loops: MorphGeometryRef;
}

/** One group moving from one state to the next between two keyframe offsets. */
export interface MorphSegment {
  group: string;
  from: { offset: number; state: string };
  to: { offset: number; state: string };
  transitions: MorphTransition[];
  clips: MorphClipFrames[];
}

/** A clip target's wrapper in a live part, and the matrix from root space into it. */
export interface MorphClipTarget {
  clip: number;
  /** The id (before occurrence namespacing) of the wrapper's `clipPath`. */
  clipPath: string;
  /** Root user space to the wrapper's user space, `[a, b, c, d, e, f]`. */
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
  clipTargets: MorphClipTarget[];
  diagnostics: MorphBakeDiagnostic[];
}
