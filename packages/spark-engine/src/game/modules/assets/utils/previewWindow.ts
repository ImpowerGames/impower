import {
  type SceneAssets,
  type SceneBeat,
} from "@impower/sparkdown/src/compiler/types/SceneAssets";
import type {
  ProgramAddress,
  ProgramLocator,
} from "@impower/sparkdown/src/compiler/types/ProgramAddress";

export function beatIndexIn(
  beats: readonly SceneBeat[],
  locator: ProgramLocator,
  address: ProgramAddress | null | undefined,
): number {
  if (address == null) {
    return -1;
  }
  for (let i = 0; i < beats.length; i++) {
    if (beats[i]!.address === address) {
      return i;
    }
  }
  const here = locator.locationOf(address);
  if (!here) {
    return -1;
  }
  let index = -1;
  for (let i = 0; i < beats.length; i++) {
    const at = locator.locationOf(beats[i]!.address);
    if (!at || at.uri !== here.uri) {
      continue;
    }
    const before =
      at.startLine < here.startLine ||
      (at.startLine === here.startLine && at.startColumn <= here.startColumn);
    if (before) {
      index = i;
    }
  }
  return index;
}

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
