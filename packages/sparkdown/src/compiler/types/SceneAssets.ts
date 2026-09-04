/**
 * One runtime leaf that references assets, in document order within its flow.
 *
 * `path` is the leaf's runtime path (a key of `program.pathLocations`), so the
 * engine can locate the beat the story is on and predict from there. Names are
 * recorded as authored: image tokens are split on `+` but keep their `~filter`
 * tail (the engine canonicalizes), audio names are bare asset names.
 */
export interface SceneBeat {
  path: string;
  image?: string[];
  audio?: string[];
  /** Targets of `[[open X]]` / `[[navigate S to X]]`, whose fonts the layout needs. */
  layouts?: string[];
  /** Targets of `[[load X]]`, which every `load` arrow lowers to. */
  loads?: string[];
}

/**
 * What one top-level flow (a scene, a function, or `0` for root content) can
 * ask the loader for. See docs/engine/asset-preloading-spec.md.
 */
export interface SceneAssets {
  kind: "scene" | "function" | "root";
  /** Document order equals execution order for straight-line content; the
   *  bodies of branches follow in document order. */
  beats: SceneBeat[];
  /** Unions over `beats` in first-use order, including the beats of every
   *  function this flow calls. */
  image: string[];
  audio: string[];
  layouts: string[];
  loads: string[];
  /** Flows reachable by absolute diverts, tunnels, and threads, excluding this
   *  flow and functions. */
  successors: string[];
  /** Function flows this flow invokes. */
  calls: string[];
  /** A directive or divert target is computed at runtime, so the static set is
   *  a subset. */
  dynamic?: true;
  /** The static prefix of each dynamic image name (`bunny~{mood}` -> `bunny`),
   *  so every variant of the base can be warmed as a heuristic. */
  dynamicBases?: string[];
}

/**
 * The per-flow capture the compiler fills during its runtime-tree walk and
 * keeps in its incremental flow cache. `populateSceneAssets` turns captures
 * into `SceneAssets`.
 */
export interface SceneAssetCapture {
  beats: SceneBeat[];
  /** Absolute divert edges out of this flow: the target flow name and whether
   *  the divert is a function call (returns to the caller). */
  edges: Array<{ target: string; call: boolean }>;
  dynamic: boolean;
  dynamicBases: string[];
}

export const createSceneAssetCapture = (): SceneAssetCapture => ({
  beats: [],
  edges: [],
  dynamic: false,
  dynamicBases: [],
});
