import {
  type SceneAssets,
  type SceneBeat,
} from "@impower/sparkdown/src/compiler/types/SceneAssets";

/** `[scriptIndex, line, column, …]` per runtime path, as the program records it. */
export type PathLocations = Record<string, ArrayLike<number> | undefined>;

/** Beats from the cursor's whose images a preview waits for before it
 *  writes: the cursor's own beat, and the two after it, because a beat that
 *  only shows an image displays together with the line that follows. */
export const PREVIEW_GATE_BEATS = 3;

/**
 * The index of the beat at `path` in `beats`, or of the last beat before it
 * in the source when `path` is not itself a beat (a cursor inside a line, a
 * heading between two lines). -1 when nothing precedes it.
 */
export function beatIndexIn(
  beats: readonly SceneBeat[],
  locations: PathLocations | undefined,
  path: string | null | undefined,
): number {
  if (!path) {
    return -1;
  }
  for (let i = 0; i < beats.length; i++) {
    if (beats[i]!.path === path) {
      return i;
    }
  }
  const here = locations?.[path];
  if (!here) {
    return -1;
  }
  let index = -1;
  for (let i = 0; i < beats.length; i++) {
    const at = locations?.[beats[i]!.path];
    if (!at) {
      continue;
    }
    const before =
      at[0]! < here[0]! ||
      (at[0] === here[0] &&
        (at[1]! < here[1]! || (at[1] === here[1] && at[2]! <= here[2]!)));
    if (before) {
      index = i;
    }
  }
  return index;
}

/**
 * How a preview divides a scene around the cursor: the beats within
 * `distance` of the cursor's beat on either side come first (`near`), then
 * the rest of the scene (`rest`), the beats after the window before the ones
 * behind it. A cursor can land anywhere in a scene, so all of it warms, but
 * what the author is looking at and about to click warms first. With
 * `distance` 0 the whole scene is near, as play's window then covers the
 * rest of a flow.
 */
export function previewWindow(
  entry: SceneAssets,
  index: number,
  distance: number,
): { near: SceneBeat[]; rest: SceneBeat[] } {
  const beats = entry.beats;
  if (beats.length === 0) {
    return { near: [], rest: [] };
  }
  if (distance <= 0) {
    return { near: [...beats], rest: [] };
  }
  const at = Math.min(Math.max(0, index), beats.length - 1);
  const from = Math.max(0, at - distance);
  const to = Math.min(beats.length, at + distance + 1);
  return {
    near: beats.slice(from, to),
    rest: [...beats.slice(to), ...beats.slice(0, from)],
  };
}
