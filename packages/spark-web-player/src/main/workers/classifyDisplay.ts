import type { SourceLocation } from "@impower/sparkdown/src/compiler/types/ProgramAddress";
import type { SceneAssets } from "@impower/sparkdown/src/compiler/types/SceneAssets";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { addressOf } from "@impower/sparkdown/src/program/ProgramChunk";

/** A display the page shows, as the next one is classified against it. */
export interface ShownDisplay {
  program: SparkProgram;
  /** A suggestion's program, rather than the real one. */
  speculative: boolean;
  file: string;
  line: number;
  /** How many times the game had built its define tables
   *  (`Game.definesContextBuilds`). */
  definesContextBuilds: number;
}

/** Why a display connects in full rather than in place. */
export type FullDisplayReason =
  /** The application is new (`fresh`), or the page does not show a
   *  display of this game that completed, with nothing sent since. */
  | "unshown"
  /** The route to the point left no checkpoint to load. */
  | "route"
  /** The cursor is on another line, which is another beat. */
  | "point"
  /** A suggestion's program replaced the real one, or the reverse. */
  | "swap"
  /** The program is not measured against the one the page shows, or the
   *  compile ran the declarations again or moved a symbol's definition. */
  | "program"
  /** A layout, component, screen, style or asset the page's construction
   *  reads changed, or the define tables were built again. */
  | "context"
  /** A statement the compile emitted or dropped does not span the cursor's
   *  line: another statement of the scene, another flow. */
  | "statements"
  /** A flow was added or removed, or one changed its kind, its beats'
   *  count, or the flows and layouts it reaches. */
  | "scenes";

export type DisplayClass =
  | { inPlace: true }
  | { inPlace: false; reason: FullDisplayReason };

const full = (reason: FullDisplayReason): DisplayClass => ({
  inPlace: false,
  reason,
});

/** Whether `location` covers `line` of `file`. A range that ends at a
 *  line's first column does not reach that line. */
const covers = (
  location: SourceLocation | undefined,
  file: string,
  line: number,
): boolean =>
  location !== undefined &&
  location.uri === file &&
  location.startLine <= line &&
  (line < location.endLine ||
    (line === location.endLine && location.endColumn > 0));

/** The channels the page's construction reads, by identity: the compiler
 *  hands out the same channel while the context type it mirrors is
 *  unchanged (`populateEngineChannels`). The filtered images a directive
 *  implies are the exception: the compile's own implicit definitions move
 *  with the names the script uses, and a name both programs use is defined
 *  alike in both, so that channel may differ. */
const sameConstruction = (a: SparkProgram, b: SparkProgram): boolean => {
  if (
    a.layouts !== b.layouts ||
    a.screens !== b.screens ||
    a.components !== b.components ||
    a.styles !== b.styles
  ) {
    return false;
  }
  const types = new Set([
    ...Object.keys(a.assets ?? {}),
    ...Object.keys(b.assets ?? {}),
  ]);
  for (const type of types) {
    if (type !== "filtered_image" && a.assets?.[type] !== b.assets?.[type]) {
      return false;
    }
  }
  return true;
};

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((value, i) => value === b[i]);

/** Whether the scene map the scene tracker and the asset module's
 *  prediction read is the same: the flows, their kinds, how many beats
 *  each holds and what each reaches. The pictures and sounds a beat names
 *  may differ: only the statement under the cursor changed, and the
 *  preview waits for the pictures of its beat whatever the prediction
 *  sent. */
const sameSceneMap = (
  a: Record<string, SceneAssets> | undefined,
  b: Record<string, SceneAssets> | undefined,
): boolean => {
  if (a === b) {
    return true;
  }
  const names = Object.keys(b ?? {});
  if (!a || !b || names.length !== Object.keys(a).length) {
    return false;
  }
  for (const name of names) {
    const x = a[name];
    const y = b[name]!;
    if (
      !x ||
      x.kind !== y.kind ||
      x.beats.length !== y.beats.length ||
      !sameList(x.successors, y.successors) ||
      !sameList(x.calls, y.calls) ||
      !sameList(x.loads, y.loads) ||
      !sameList(x.layouts, y.layouts)
    ) {
      return false;
    }
  }
  return true;
};

/**
 * Whether a display can put the page in its frame in place
 * (`Game.connectInPlace`) rather than connecting in full (#657): only the
 * statement under the cursor changed since the display the page shows.
 * That display (`shown`) completed and nothing was sent the page since, the
 * cursor is on the same line, a suggestion's program did not replace the
 * real one or the reverse, the program was measured against the one shown,
 * its compile ran the declarations no more and moved no symbol, every
 * statement it emitted or dropped spans the cursor's line, what the page's
 * construction reads is what it read, and the scene map is the same. A
 * statement is the finest unit a compile reports: the lines of a dialogue
 * block share one, so an edit of another line of the block under the
 * cursor is displayed in place too. The frame does not rest on this rule
 * or on the route's checkpoint, which is not compared either (it is taken
 * partway into the cursor's beat, so it moves with every edit of it): the
 * display in place puts the page in the state the game loads wherever
 * that differs from what the page shows. The rule keeps the display in
 * place to an edit of the beat under the cursor.
 */
export function classifyDisplay(
  shown: ShownDisplay | undefined,
  next: ShownDisplay,
  options: { fresh: boolean; checkpointLoads: boolean },
): DisplayClass {
  if (options.fresh || !shown) {
    return full("unshown");
  }
  if (!options.checkpointLoads) {
    return full("route");
  }
  if (shown.file !== next.file || shown.line !== next.line) {
    return full("point");
  }
  if (shown.speculative !== next.speculative) {
    return full("swap");
  }
  const before = shown.program;
  const program = next.program;
  if (program !== before) {
    const changes = program.changes;
    const chunks = changes?.chunks;
    if (
      !program.chunks ||
      !before.chunks ||
      !chunks ||
      changes.since === undefined ||
      changes.since !== before.changes?.id ||
      chunks.initializers ||
      chunks.moved.length > 0
    ) {
      return full("program");
    }
    if (
      !sameConstruction(before, program) ||
      shown.definesContextBuilds !== next.definesContextBuilds
    ) {
      return full("context");
    }
    for (const id of chunks.emitted) {
      if (!covers(program.chunks.locationOf(addressOf(id, 0)), next.file, next.line)) {
        return full("statements");
      }
    }
    for (const id of chunks.dropped) {
      if (!covers(before.chunks.locationOf(addressOf(id, 0)), next.file, next.line)) {
        return full("statements");
      }
    }
    if (!sameSceneMap(before.sceneAssets, program.sceneAssets)) {
      return full("scenes");
    }
  } else if (shown.definesContextBuilds !== next.definesContextBuilds) {
    return full("context");
  }
  return { inPlace: true };
}
