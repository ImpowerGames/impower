import { profile } from "../../utils/profile";
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
  startFrom?: { file: string; line: number };
  readonly startPath: string | null | undefined;
  setStartFrom(startFrom: { file: string; line: number }): void;
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
  if (
    newStartFrom.file !== game.startFrom?.file ||
    newStartFrom.line !== game.startFrom?.line
  ) {
    profile("start", ctx.profilerId + " " + "game/setStartFrom");
    game.setStartFrom(newStartFrom);
    profile("end", ctx.profilerId + " " + "game/setStartFrom");
    const toPath = game.startPath;
    if (toPath) {
      ctx.searchRouteTo(game, toPath);
      // Augment with the simulated checkpoint, and with what the search
      // established about this start point.
      ctx.routeSearches.report(params, toPath);
    }
  } else {
    // The start point did not move (the editor re-selects on every cursor
    // change, including one that only moves the column), so the search already
    // run for it still describes this selection — but only if it was run for
    // THIS path. Nothing else here may be reused: the newest checkpoint in the
    // store belongs to the last route that was replayed, which is a different
    // line whenever the search since then found no route.
    ctx.routeSearches.report(params, game.startPath);
  }
}
