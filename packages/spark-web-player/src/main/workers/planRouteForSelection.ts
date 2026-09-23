import { profile } from "../../utils/profile";
import {
  programIdentity,
  type IdentifiableProgram,
} from "../../utils/programIdentity";
import type { RouteSearchLog, RouteSearchReportTarget } from "./RouteSearchLog";

/** The selection a `compiler/didSelect` notification carries, as this decision
 *  reads it. `programOutdated` is the compiler's verdict on whether the program
 *  the game holds still describes the document that was selected in. */
export interface SelectionForRoute extends RouteSearchReportTarget {
  textDocument: { uri: string };
  selectedRange: { start: { line: number } };
  programOutdated?: boolean;
}

/** The game, as far as this decision needs it. Structural so the decision can
 *  be exercised without building a real one. */
export interface RoutableGame {
  readonly program: IdentifiableProgram | undefined;
  readonly startPath: string | null | undefined;
  setStartFrom(
    startFrom: { file: string; line: number },
    beat?: "first" | "last",
  ): void;
}

export interface PlanRouteForSelectionContext<G extends RoutableGame> {
  /** The game holding the last compiled program, or nothing if none is built. */
  game: G | undefined;
  /** Record the selection as the point the next compile starts from. */
  rememberStartFrom(startFrom: { file: string; line: number }): void;
  /** Plan a route to a story path and replay it, recording the outcome. */
  searchRouteTo(game: G, toPath: string): void;
  routeSearches: RouteSearchLog;
  profilerId: string | undefined;
}

/**
 * Point `game` at the `beat` of the line `startFrom` names, in the program it
 * holds, and replay the route there unless `log` already holds the search for
 * that path in that program. Answers the path, which `log` describes after.
 *
 * The editor re-selects on every cursor move, including one that only moves
 * the column, and a search already run for the path still describes it. The
 * path and the program are what decide that, not the line: a line that `>`
 * breaks resolves to one path for PLAY, which starts at its first beat, and to
 * another for the preview, which shows its last (#721).
 */
export function routeGameTo<G extends RoutableGame>(
  game: G,
  startFrom: { file: string; line: number },
  beat: "first" | "last",
  log: RouteSearchLog,
  search: (game: G, toPath: string) => void,
  profilerId: string | undefined,
): string | null | undefined {
  profile("start", profilerId + " " + "game/setStartFrom");
  game.setStartFrom(startFrom, beat);
  profile("end", profilerId + " " + "game/setStartFrom");
  const toPath = game.startPath;
  if (toPath && !log.holds(toPath, programIdentity(game.program))) {
    search(game, toPath);
  }
  return toPath;
}

/**
 * What the player's workspace worker does when the author selects a line.
 *
 * Extracted from the worker module so it can be exercised on its own: the
 * worker's own module talks to `self` at import time, so nothing there is
 * reachable from a test, and the guard below is the one place that keeps a
 * route search off a program the document has outrun (#489).
 */
export function planRouteForSelection<G extends RoutableGame>(
  params: SelectionForRoute,
  ctx: PlanRouteForSelectionContext<G>,
): void {
  const game = ctx.game;
  if (!game) {
    return;
  }
  const newStartFrom = {
    file: params.textDocument.uri,
    line: params.selectedRange.start.line,
  };
  ctx.rememberStartFrom(newStartFrom);
  if (params.programOutdated) {
    // This game holds the program compiled from the document as it was before
    // the edit, so a route planned to this line would replay to whatever used
    // to sit there — and would cache that route's favored conditions and
    // choices for the next compile to start from. The selection is recorded
    // above as the point the next compile starts from, and that compile plans
    // its route against the program it produces.
    return;
  }
  // The route ends at the beat the preview shows: a line's last beat.
  const toPath = routeGameTo(
    game,
    newStartFrom,
    "last",
    ctx.routeSearches,
    ctx.searchRouteTo,
    ctx.profilerId,
  );
  // Augment with the simulated checkpoint, and with what the search
  // established about this start point. Nothing else here may be reported:
  // the newest checkpoint in the store belongs to the last route that was
  // replayed, which is a different line whenever the search since then found
  // no route.
  ctx.routeSearches.report(params, toPath);
}
