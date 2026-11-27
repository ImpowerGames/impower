import {
  type SceneBeat,
  type SceneImageWrite,
} from "@impower/sparkdown/src/compiler/types/SceneAssets";

export interface PictureRun {
  target: string;
  assets: string[];
  distance: number;
  scope: Scope;
  framings: string[];
  effects: SceneImageWrite[];
}

export interface PredictedBeat {
  beat: SceneBeat;
  distance: number;
}

const same = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((name, index) => name === b[index]);

type Scope = readonly (readonly [number, number])[];

export const within = (inner: Scope, outer: Scope): boolean =>
  outer.length <= inner.length &&
  outer.every(
    ([decision, arm], index) =>
      inner[index]![0] === decision && inner[index]![1] === arm,
  );

export const reachable = (a: Scope, b: Scope): boolean => {
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const [decisionA, armA] = a[index]!;
    const [decisionB, armB] = b[index]!;
    if (decisionA !== decisionB) {
      return true;
    }
    if (armA !== armB) {
      return false;
    }
  }
  return true;
};

export function pictureRuns(
  beats: readonly PredictedBeat[],
  shown: (target: string) => { assets: string[]; at?: string } | undefined,
  fallback: string | undefined,
): PictureRun[] {
  const runs: PictureRun[] = [];
  const open = new Map<string, PictureRun[]>();
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
        scope: [],
        framings: current.at ? [current.at] : [],
        effects: [],
      };
      runs.push(run);
      open.set(target, [run]);
    }
  };
  for (const { beat, distance } of beats) {
    const scope = beat.scope ?? [];
    for (const write of beat.writes ?? []) {
      const target = write.target ?? fallback;
      if (!target) {
        continue;
      }
      seed(target);
      const standing = open.get(target) ?? [];
      if (write.hide) {
        if (write.with?.length) {
          for (const run of standing) {
            if (reachable(run.scope, scope)) {
              run.effects.push(write);
            }
          }
        }
        open.set(
          target,
          standing.filter((run) => !within(run.scope, scope)),
        );
        continue;
      }
      let touched = standing.filter((run) => reachable(run.scope, scope));
      if (write.image?.length) {
        const image = write.image;
        const kept = touched.find((run) => same(run.assets, image));
        if (kept) {
          touched = [kept];
        } else {
          const run: PictureRun = {
            target,
            assets: image,
            distance,
            scope,
            framings: [],
            effects: [],
          };
          runs.push(run);
          open.set(target, [
            ...(write.animate
              ? standing
              : standing.filter((run) => !within(run.scope, scope))),
            run,
          ]);
          touched = [run];
        }
      }
      const travels = !(write.animate && write.image?.length);
      for (const run of touched) {
        for (const framing of travels ? [write.at, write.to] : []) {
          if (framing) {
            run.framings.push(framing);
          }
        }
        if (write.with?.length) {
          run.effects.push(write);
        }
      }
    }
  }
  return runs;
}
