import { type SceneBeat } from "@impower/sparkdown/src/compiler/types/SceneAssets";

export interface PictureRun {
  target: string;
  assets: string[];
  distance: number;
  framings: string[];
  effects: string[];
}

export interface PredictedBeat {
  beat: SceneBeat;
  distance: number;
}

const same = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((name, index) => name === b[index]);

export function pictureRuns(
  beats: readonly PredictedBeat[],
  shown: (target: string) => { assets: string[]; at?: string } | undefined,
  fallback: string | undefined,
): PictureRun[] {
  const runs: PictureRun[] = [];
  const open = new Map<string, PictureRun>();
  const seeded = new Set<string>();
  const seed = (target: string) => {
    if (seeded.has(target)) {
      return;
    }
    seeded.add(target);
    const current = shown(target);
    if (current) {
      const run: PictureRun = {
        target,
        assets: current.assets,
        distance: 0,
        framings: current.at ? [current.at] : [],
        effects: [],
      };
      runs.push(run);
      open.set(target, run);
    }
  };
  for (const { beat, distance } of beats) {
    for (const write of beat.writes ?? []) {
      const target = write.target ?? fallback;
      if (!target) {
        continue;
      }
      seed(target);
      if (write.hide) {
        open.delete(target);
        continue;
      }
      let run = open.get(target);
      if (write.image?.length && !(run && same(run.assets, write.image))) {
        run = { target, assets: write.image, distance, framings: [], effects: [] };
        runs.push(run);
        open.set(target, run);
      }
      if (!run) {
        continue;
      }
      for (const framing of [write.at, write.to]) {
        if (framing) {
          run.framings.push(framing);
        }
      }
      if (write.with) {
        run.effects.push(write.with);
      }
    }
  }
  return runs;
}
