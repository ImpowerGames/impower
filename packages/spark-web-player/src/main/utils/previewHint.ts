import { assetsBuiltinDefinitions } from "@impower/spark-engine/src/game/modules/assets/assetsBuiltinDefinitions";
import { type AssetItem } from "@impower/spark-engine/src/game/modules/assets/types/AssetItem";
import {
  beatIndexIn,
  previewWindow,
} from "@impower/spark-engine/src/game/modules/assets/utils/previewWindow";
import { type SceneBeat } from "@impower/sparkdown/src/compiler/types/SceneAssets";
import { type SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { programLocator } from "@impower/sparkdown/src/compiler/utils/programLocator";
import { resolveImageSrcs } from "./resolveImageSrcs";

export const HINT_BEATS = 2;

export interface PreviewHintState {
  uri: string;
  version: number | undefined;
  scene: string;
  beat: number;
  line: number;
  nearBeat: number;
}

export interface PreviewHintPlan {
  state: PreviewHintState;
  cursor: AssetItem[];
  near: AssetItem[];
  rest: AssetItem[] | null;
}

export interface PreviewHintCache {
  hint(items: AssetItem[]): void;
  prefetch(items: AssetItem[], priority: 2 | 3): void;
}

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

export function planPreviewHint(
  program: SparkProgram,
  uri: string,
  line: number,
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
  const locator = programLocator(program);
  const address = locator.addressAt(uri, line, { beat: "last" });
  const scene = locator.sceneAt(address) ?? "0";
  const entry = sceneAssets[scene];
  const known = locator.locationOf(address) !== undefined;
  const beat =
    entry && known
      ? Math.max(0, beatIndexIn(entry.beats, locator, address))
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

export function applyPreviewHint(
  cache: PreviewHintCache,
  plan: PreviewHintPlan | Omit<PreviewHintPlan, "state">,
): void {
  cache.hint(plan.cursor);
  if (plan.near.length > 0) {
    cache.prefetch(plan.near, 2);
  }
  if (plan.rest && plan.rest.length > 0) {
    cache.prefetch(plan.rest, 3);
  }
}
