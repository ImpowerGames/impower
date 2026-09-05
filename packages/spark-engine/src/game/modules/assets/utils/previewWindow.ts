import {
  type SceneAssets,
  type SceneBeat,
} from "@impower/sparkdown/src/compiler/types/SceneAssets";

/** `[scriptIndex, line, column, …]` per runtime path, as the program records it. */
export type PathLocations = Record<string, ArrayLike<number> | undefined>;

/** At most this many beats go through a preview's gate at once. */
export const PREVIEW_GATE_BEATS = 6;

/** The index of the beat whose path is exactly `path`, or -1. A preview
 *  gates from a beat only when the cursor resolved to that beat itself: a
 *  cursor on a plain line between two beats writes that line and nothing
 *  that names an asset (what the earlier beat showed is in the checkpoint,
 *  which the restore gate covers on its own). */
export function exactBeatIndex(
  beats: readonly SceneBeat[],
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
  return -1;
}

/**
 * Whether anything the program located begins on a line strictly between
 * `afterLine` and `beforeLine` of script `script`: a line that displays on
 * its own, a divert, a branch heading. A preview that reaches such a thing
 * writes it and stops, so a beat beyond it is the next scrub's.
 */
export function leafBetween(
  locations: PathLocations | undefined,
  script: number,
  afterLine: number,
  beforeLine: number,
): boolean {
  if (!locations || beforeLine - afterLine < 2) {
    return false;
  }
  for (const key in locations) {
    const at = locations[key];
    if (!at || at[0] !== script) {
      continue;
    }
    const line = at[1]!;
    if (line > afterLine && line < beforeLine) {
      return true;
    }
  }
  return false;
}

/**
 * The beats a preview at beat `index` of `entry` writes at once: the beat
 * itself and, up to {@link PREVIEW_GATE_BEATS} in all, the beats after it
 * with nothing the program located between them, in the same script. Beats
 * are the leaves that name assets, so "the next beat" can be far down the
 * scene, and the source distance says nothing by itself: two image-only
 * lines display together across any number of blank lines, while a line of
 * dialogue between two of them displays on its own and stops the preview
 * there. What tells the two apart is whether a located line lies between
 * the beats ({@link leafBetween}).
 */
export function gateBeats(
  entry: SceneAssets,
  index: number,
  locations: PathLocations | undefined,
): SceneBeat[] {
  const beats = entry.beats;
  const first = beats[index];
  if (!first) {
    return [];
  }
  const out = [first];
  const firstAt = locations?.[first.path];
  if (!firstAt) {
    return out;
  }
  const script = firstAt[0]!;
  let endLine = firstAt[3] ?? firstAt[1]!;
  for (
    let i = index + 1;
    i < beats.length && out.length < PREVIEW_GATE_BEATS;
    i++
  ) {
    const beat = beats[i]!;
    const at = locations?.[beat.path];
    if (
      !at ||
      at[0] !== script ||
      leafBetween(locations, script, endLine, at[1]!)
    ) {
      break;
    }
    out.push(beat);
    endLine = Math.max(endLine, at[3] ?? at[1]!);
  }
  return out;
}

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
