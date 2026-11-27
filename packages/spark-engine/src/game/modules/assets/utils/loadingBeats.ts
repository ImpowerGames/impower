import {
  type SceneAssets,
  type SceneBeat,
} from "@impower/sparkdown/src/compiler/types/SceneAssets";

const memo = new WeakMap<readonly SceneBeat[], SceneBeat[]>();

export const loads = (beat: SceneBeat): boolean =>
  Boolean(beat.image || beat.audio || beat.layouts || beat.loads);

export function loadingBeats(entry: Pick<SceneAssets, "beats">): SceneBeat[] {
  const beats = entry.beats;
  let loading = memo.get(beats);
  if (!loading) {
    loading = beats.every(loads) ? beats : beats.filter(loads);
    memo.set(beats, loading);
  }
  return loading;
}
