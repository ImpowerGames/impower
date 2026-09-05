import { SceneTracker } from "@impower/spark-engine/src/game/core/classes/SceneTracker";
import { findClosestPath } from "@impower/spark-engine/src/game/core/utils/findClosestPath";
import { assetsBuiltinDefinitions } from "@impower/spark-engine/src/game/modules/assets/assetsBuiltinDefinitions";
import { type AssetItem } from "@impower/spark-engine/src/game/modules/assets/types/AssetItem";
import {
  beatIndexIn,
  gateBeats,
  previewWindow,
} from "@impower/spark-engine/src/game/modules/assets/utils/previewWindow";
import { type SceneBeat } from "@impower/sparkdown/src/compiler/types/SceneAssets";
import { type SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { resolveImageSrcs } from "./resolveImageSrcs";

/** Where the cursor last was, as far as the hint is concerned. */
export interface PreviewHintState {
  uri: string;
  version: number | undefined;
  scene: string;
  beat: number;
  line: number;
}

/** What the page asks the cache for after a cursor move. */
export interface PreviewHintPlan {
  state: PreviewHintState;
  /** The beats a preview at the cursor writes at once: the express lane. */
  cursor: AssetItem[];
  /** The window around the cursor, at the window's priority. */
  near: AssetItem[];
  /** The rest of the scene, and what its functions show, at background
   *  priority; only when the cursor entered a scene it was not in. */
  rest: AssetItem[] | null;
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
 * planning. Returns nothing when there is nothing to do: the same line of
 * the same program, or the same beat of the same scene (a recompile that
 * left the cursor on its beat changes nothing the engine's own gate at
 * connect will not cover). The rest of the scene is resolved once per scene
 * entered, not per beat: resolving every name in a long scene costs tens of
 * milliseconds on the thread that paints the preview.
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
  if (
    last &&
    last.uri === uri &&
    last.version === program.version &&
    last.line === line
  ) {
    return null;
  }
  const path = findClosestPath(
    { file: uri, line },
    pathEntries,
    Object.keys(program.scripts ?? {}),
  );
  const scene = SceneTracker.sceneOf(path) ?? "0";
  const entry = sceneAssets[scene];
  const beat = entry
    ? Math.max(0, beatIndexIn(entry.beats, program.pathLocations, path))
    : 0;
  const state: PreviewHintState = {
    uri,
    version: program.version,
    scene,
    beat,
    line,
  };
  const sameBeat =
    last != null &&
    last.uri === uri &&
    last.scene === scene &&
    last.beat === beat;
  if (!entry || sameBeat || entry.kind === "function") {
    return { state, cursor: [], near: [], rest: null };
  }
  const items = (names: Iterable<string>): AssetItem[] =>
    resolveImageSrcs(program.context, [...names]).map((src) => ({
      kind: "image" as const,
      src,
    }));
  const namesOf = (beats: SceneBeat[]) => beats.flatMap((b) => b.image ?? []);
  const { near, rest } = previewWindow(entry, beat, predictDistanceOf(program));
  const sceneChanged = !last || last.uri !== uri || last.scene !== scene;
  const nearNames = new Set(namesOf(near));
  // The rest of the scene, and the flow's union for what its beats do not
  // hold (the images of the functions it calls), less what the window
  // already asks for.
  const restNames = new Set(
    [...namesOf(rest), ...entry.image].filter((name) => !nearNames.has(name)),
  );
  return {
    state,
    cursor: items(namesOf(gateBeats(entry, beat, program.pathLocations))),
    near: items(nearNames),
    rest: sceneChanged ? items(restNames) : null,
  };
}
