import { SceneTracker } from "@impower/spark-engine/src/game/core/classes/SceneTracker";
import { findClosestPath } from "@impower/spark-engine/src/game/core/utils/findClosestPath";
import { assetsBuiltinDefinitions } from "@impower/spark-engine/src/game/modules/assets/assetsBuiltinDefinitions";
import { type AssetItem } from "@impower/spark-engine/src/game/modules/assets/types/AssetItem";
import {
  beatIndexIn,
  previewWindow,
} from "@impower/spark-engine/src/game/modules/assets/utils/previewWindow";
import { type SceneBeat } from "@impower/sparkdown/src/compiler/types/SceneAssets";
import { type SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { resolveImageSrcs } from "./resolveImageSrcs";

/**
 * How many beats the hint guesses a preview at the cursor writes: the beat
 * at or before the cursor and the ones after it, up to this many in all. The
 * engine's gate is exact, since it runs the beat dry once the checkpoint is
 * loaded; the hint is issued before the route is even planned, when nothing
 * can run, so it guesses. A guess too wide costs express-lane bandwidth on
 * pictures the next scrub is likely to want anyway; one too narrow costs
 * the overlap the hint exists for.
 */
export const HINT_BEATS = 3;

/** Where the cursor last was, as far as the hint is concerned. */
export interface PreviewHintState {
  uri: string;
  version: number | undefined;
  scene: string;
  beat: number;
  line: number;
  /** The beat the last window was centred on, in this scene. */
  nearBeat: number;
}

/** What the page asks the cache for after a cursor move. */
export interface PreviewHintPlan {
  state: PreviewHintState;
  /** The hint's guess at what a preview at the cursor writes: the express lane. */
  cursor: AssetItem[];
  /** The window around the cursor, at the window's priority; empty while
   *  the cursor stays inside half of the last window sent. */
  near: AssetItem[];
  /** The rest of the scene at background priority; only when the cursor
   *  entered a scene it was not in. */
  rest: AssetItem[] | null;
}

/** The slice of the cache a plan is applied to. */
export interface PreviewHintCache {
  hint(items: AssetItem[]): void;
  prefetch(items: AssetItem[], priority: 2 | 3): void;
}

/** The program's `predict_distance`, as the engine will read it. */
export const predictDistanceOf = (program: SparkProgram): number => {
  const authored = (program.context as Record<string, any> | undefined)?.[
    "config"
  ]?.["assets"]?.["predict_distance"];
  return typeof authored === "number" &&
    Number.isFinite(authored) &&
    authored >= 0
    ? authored
    : assetsBuiltinDefinitions().config.assets.predict_distance;
};

/**
 * Plan the page's cursor hint, the prefetch issued the moment the cursor
 * lands and before the route to it is planned, so the fetches overlap the
 * planning. Returns nothing for the same line of the same program. Within
 * one program, the same beat asks for nothing again; after a recompile the
 * same beat asks for its own pictures again (an edit may have changed them)
 * and nothing else. The window is resolved when the cursor moves more than
 * half its reach from where the last one was centred, and the rest of the
 * scene once per scene entered: resolving every name in a long scene costs
 * tens of milliseconds on the thread that paints the preview. A cursor the
 * program cannot place, or one inside a function, hints nothing, as the
 * engine gates nothing for it.
 */
export function planPreviewHint(
  program: SparkProgram,
  uri: string,
  line: number,
  pathEntries: Array<[string, [number, number, number, number, number]]>,
  last: PreviewHintState | undefined,
): PreviewHintPlan | null {
  const sceneAssets = program.sceneAssets;
  if (!sceneAssets) {
    return null;
  }
  const sameProgram =
    last != null &&
    last.uri === uri &&
    last.version !== undefined &&
    last.version === program.version;
  if (sameProgram && last!.line === line) {
    return null;
  }
  const path = findClosestPath(
    { file: uri, line },
    pathEntries,
    Object.keys(program.scripts ?? {}),
  );
  const scene = SceneTracker.sceneOf(path) ?? "0";
  const entry = sceneAssets[scene];
  const locations = program.pathLocations;
  const known = Boolean(path && locations?.[path]);
  const beat =
    entry && known
      ? Math.max(0, beatIndexIn(entry.beats, locations, path))
      : 0;
  const sameScene = last != null && last.uri === uri && last.scene === scene;
  const sameBeat = sameScene && last!.beat === beat;
  const state: PreviewHintState = {
    uri,
    version: program.version,
    scene,
    beat,
    line,
    nearBeat: sameScene ? last!.nearBeat : beat,
  };
  const nothing = { state, cursor: [], near: [], rest: null };
  if (!entry || !known || entry.kind === "function") {
    return nothing;
  }
  if (sameBeat && sameProgram) {
    return nothing;
  }
  const items = (names: Iterable<string>): AssetItem[] =>
    resolveImageSrcs(program.context, [...names]).map((src) => ({
      kind: "image" as const,
      src,
    }));
  const namesOf = (beats: SceneBeat[]) => beats.flatMap((b) => b.image ?? []);
  const cursor = items(namesOf(entry.beats.slice(beat, beat + HINT_BEATS)));
  if (sameBeat) {
    // A recompile with the cursor on its beat: its own pictures again, in
    // case the edit changed them; the window and the scene stand.
    return { state, cursor, near: [], rest: null };
  }
  const distance = predictDistanceOf(program);
  const { near, rest } = previewWindow(entry, beat, distance);
  const nearNames = new Set(namesOf(near));
  const moved =
    !sameScene ||
    Math.abs(beat - last!.nearBeat) > Math.floor(distance / 2);
  if (moved) {
    state.nearBeat = beat;
  }
  return {
    state,
    cursor,
    near: moved ? items(nearNames) : [],
    rest: sameScene
      ? null
      : items(namesOf(rest).filter((name) => !nearNames.has(name))),
  };
}

/** Hand a plan to the cache: the cursor's beats as the hint (always, an
 *  empty hint is what retires the last one's leftovers), the window at 2,
 *  the rest of the scene at 3. */
export function applyPreviewHint(
  cache: PreviewHintCache,
  plan: PreviewHintPlan,
): void {
  cache.hint(plan.cursor);
  if (plan.near.length > 0) {
    cache.prefetch(plan.near, 2);
  }
  if (plan.rest && plan.rest.length > 0) {
    cache.prefetch(plan.rest, 3);
  }
}
