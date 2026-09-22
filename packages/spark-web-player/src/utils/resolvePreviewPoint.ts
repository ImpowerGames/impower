import { findClosestPath } from "@impower/spark-engine/src/game/core/utils/findClosestPath";

/** The program a preview point is resolved against. */
export interface PreviewProgram {
  pathLocations?: any;
  scripts: Record<string, unknown>;
}

/** What the game showing the preview remembers of the last one. The page's
 *  `Game` and the worker's displaying game both carry these. */
export interface PreviewingGame {
  state: string;
  previewFrom: { file: string; line: number } | undefined;
  previewPath: string | undefined;
  previewedPath: string | undefined;
}

export interface PreviewPoint {
  /** The point to preview: the cursor, or the remembered one. */
  from: { file: string; line: number };
  /** The path that point resolves to against this program, which the mark
   *  names; nothing when it resolves to none. */
  path: string | null | undefined;
  /** The path to compare against what the game last displayed, which keeps a
   *  point's old path so a repeat can be told from a first preview. */
  validPath: string | null | undefined;
  /** This is the preview that already ran, so it only has to be awaited
   *  again rather than replayed. */
  repeat: boolean;
}

/**
 * Where a preview at `from` lands, for a game holding `program`.
 *
 * The page's own preview (`GamePlayerController.updatePreview`) and the
 * worker's (`displayPreviewFrom`) resolve it here, so the two positions of the
 * worker-display switch cannot drift apart.
 */
export function resolvePreviewPoint(
  program: PreviewProgram,
  from: { file: string; line: number },
  programChanged: boolean,
  game: PreviewingGame | undefined,
): PreviewPoint {
  const scripts = Object.keys(program.scripts);
  const path = findClosestPath(from, program.pathLocations, scripts);

  // When the cursor sits on a line that resolves to no path we keep the game's
  // LAST valid preview point rather than resetting (sticky preview). But a pure
  // UI-only project — a `layout` whose only path-located flows are the synthetic
  // `__binding_*` evaluators, which findClosestPath excludes — never resolves a
  // path at all, so the game would never have a remembered point and
  // `game.preview()` would never be called even once. Its layouts are mounted at
  // connect but the layouts LAYER stays at `opacity:0`, so the whole UI renders
  // invisibly. Fall back to the cursor itself so the engine always gets its
  // preview call and can reveal the UI (Game.preview's no-path branch).
  const validFrom = (path ? from : game?.previewFrom) ?? from;
  // The path `game.preview()` will resolve for that point against THIS
  // program: the cursor's own, or the remembered point's, which is the game's
  // own path for it while the program stands and is resolved again after a
  // recompile, which can move it. The mark names this path, so the asset
  // module centres its prediction window on the beat the preview displays, and
  // a point that no longer resolves (its script renamed, its line deleted)
  // marks nothing.
  const resolvedPath = path
    ? path
    : programChanged
      ? findClosestPath(validFrom, program.pathLocations, scripts)
      : game?.previewPath;
  // A point that no longer resolves keeps its old path for the repeat below,
  // which needs it to tell a repeat from a first preview.
  const validPath = resolvedPath ?? game?.previewPath;

  // Only a repeat of a preview that actually ran. A UI-only project resolves
  // no path at all, so both sides of the comparison are undefined there —
  // matching on that would treat "we have never previewed anything" as
  // "already done" and skip the reconnect that re-evaluates its bindings.
  const repeat =
    game != null &&
    game.state === "previewing" &&
    validPath != null &&
    game.previewedPath === validPath &&
    !programChanged;

  return { from: validFrom, path: resolvedPath, validPath, repeat };
}
