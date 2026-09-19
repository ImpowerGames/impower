import type { ScriptLocation } from "../types/ScriptLocation";

const entriesOf = new WeakMap<object, [string, ScriptLocation][]>();

/**
 * `Object.entries(program.pathLocations)`, built once per program.
 *
 * A long script has tens of thousands of path locations, and one preview
 * resolves a source line against them several times (the player, then the
 * game, then the game's start point), so each program's entries are shared.
 * The array is shared: callers must not modify it.
 */
export const pathLocationEntries = (program: {
  pathLocations?: Record<string, ScriptLocation>;
}): [string, ScriptLocation][] => {
  const locations = program.pathLocations;
  if (!locations) {
    return [];
  }
  let entries = entriesOf.get(locations);
  if (!entries) {
    entries = Object.entries(locations);
    entriesOf.set(locations, entries);
  }
  return entries;
};
