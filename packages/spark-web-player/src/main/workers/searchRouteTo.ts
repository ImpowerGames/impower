import { Game } from "@impower/spark-engine/src/game/core/classes/Game";
import type { StoredCheckpoint } from "@impower/spark-engine/src/game/core/classes/CheckpointStore";
import type { ScriptSource } from "@impower/spark-engine/src/game/core/types/PreviewRoute";
import type {
  RoutePlan,
  RouteResumePoint,
} from "@impower/sparkdown/src/compiler/utils/planRoute";
import type { ProgramAddress } from "@impower/sparkdown/src/compiler/types/ProgramAddress";
import { START_FLOW_NAME } from "@impower/sparkdown/src/program/ProgramSymbols";
import { profile } from "../../utils/profile";
import { programIdentity } from "../../utils/programIdentity";
import type { RouteSearchLog } from "./RouteSearchLog";

export interface RouteSearchSettings {
  profilerId?: string;
  /** Search from the story's start (`Game.planRouteFromStart`) rather than
   *  from the top of the flow the address stands in. */
  fromStart?: boolean;
  /** A search from the story's start ran the story out without reaching the
   *  address, so this one searches the flow the address stands in alone
   *  (`Game.planRouteInFlow`), and its record says the start was searched. */
  startSearched?: boolean;
  /** What the route's report reads of the scripts: a line's text and the
   *  loops (`Game.previewRouteOf`). */
  source?: ScriptSource;
}

export const searchRouteTo = (
  game: Game,
  to: ProgramAddress,
  log: RouteSearchLog,
  settings: RouteSearchSettings,
): string | undefined =>
  game.checkpointJson(searchRouteFor(game, to, log, settings) ?? null) ??
  undefined;

/** `searchRouteTo`, returning the checkpoint as the value the log holds,
 *  which the worker's display loads in place (`Game.loadCheckpoint`): the
 *  route hands it to the display with no save written or read back
 *  (#1758). */
export const searchRouteFor = (
  game: Game,
  to: ProgramAddress,
  log: RouteSearchLog,
  settings: RouteSearchSettings,
): StoredCheckpoint | undefined => {
  const {
    profilerId,
    fromStart = false,
    startSearched = false,
    source,
  } = settings;
  if (!fromStart && !startSearched && game.routesFromStartFirst(to)) {
    // Inside a scene that takes parameters, the route runs from the story's
    // start, through the divert that enters the scene with its arguments, and
    // is planned, resumed and recorded as a route from there. The scene's own
    // route, which binds nil for each parameter, stands only when that search
    // ran the story out; one cut short by a ceiling, or stopped by an error,
    // is the verdict (#1608).
    const checkpoint = searchRouteFor(game, to, log, {
      ...settings,
      fromStart: true,
    });
    if (log.outcomeFor(to)?.simulationFailure !== "exhausted") {
      return checkpoint;
    }
    return searchRouteFor(game, to, log, { ...settings, startSearched: true });
  }
  const searchedFromStart = fromStart || startSearched;
  const from = fromStart ? START_FLOW_NAME : game.routeStartOf(to);
  // Asked before anything replaces the planned route, because every question it
  // answers is about that route. Measured under its own name: it walks the
  // route's steps and reads a checkpoint back, so it is work in its own right
  // and a reader comparing a before and an after needs to see it.
  profile("start", profilerId + " " + "game/routeResumption");
  const resumption = game.routeResumption(from, to);
  profile("end", profilerId + " " + "game/routeResumption");
  const plannedRoute = game.plannedRoute;

  const planRouteTo = (resumeFrom?: RouteResumePoint) => {
    profile("start", profilerId + " " + "game/planRoute");
    // `replayPatchedRoute` below loads a checkpoint or jumps to the route's
    // start, so a route found here can be left where the search stopped rather
    // than resetting the story into a state nothing reads.
    // A search from the top starts where an earlier one's level zero
    // stopped, while the program still holds what it ran, and keeps its own.
    const budget = {
      callerResetsStory: true,
      resumeFrom,
      levelZeroStore: game.levelZeroStore,
      pins: game.pinnedOptions,
    };
    const route = fromStart
      ? Game.planRouteFromStart(game.story, game.program, to, budget)
      : startSearched
        ? Game.planRouteInFlow(game.story, game.program, from, to, budget)
        : Game.planRoute(game.story, game.program, from, to, budget);
    profile("end", profilerId + " " + "game/planRoute");
    return route;
  };

  const simulate = (run: () => StoredCheckpoint | null) => {
    profile("start", profilerId + " " + "game/simulateRoute");
    const checkpoint = run();
    profile("end", profilerId + " " + "game/simulateRoute");
    return checkpoint;
  };

  const programId = programIdentity(game.program);
  const finish = (
    route: RoutePlan,
    checkpoint: StoredCheckpoint | null | undefined,
  ) => {
    const reachedTarget = game.simulation === "success";
    const report = reachedTarget ? game.previewRouteOf(route, source) : undefined;
    log.record({
      address: to,
      programId,
      reachedTarget,
      checkpoint: checkpoint ?? undefined,
      // A route existed, so any failure here happened during the replay rather
      // than the search; the game recorded which (`"diverged"`).
      simulationFailure: reachedTarget ? undefined : game.simulationFailure,
      errors: game.routeErrors,
      shows: reachedTarget ? game.routeTargetShows : undefined,
      route: report,
      menus: reachedTarget ? Game.routeMenus(route) : undefined,
      fromStart: searchedFromStart,
    });
    return checkpoint ?? undefined;
  };

  if (
    resumption.replayOnly &&
    resumption.stepIndex != null &&
    resumption.checkpointIndex != null &&
    plannedRoute
  ) {
    const { stepIndex, checkpointIndex } = resumption;
    const checkpoint = simulate(() =>
      game.replayPlannedRoute(stepIndex, checkpointIndex),
    );
    if (game.simulation === "success") {
      return finish(plannedRoute, checkpoint);
    }
    // The route no longer ends where it ended. Everything below searches for
    // one that does.
  }

  let route: RoutePlan | null = null;
  let resumedSearch = false;
  if (
    resumption.resumeFrom &&
    (plannedRoute?.fallback || !game.searchesFromLevelZeroWork(from, to))
  ) {
    route = planRouteTo(resumption.resumeFrom);
    resumedSearch = route != null;
  }
  if (!route) {
    // Either there was nothing to resume from, or resuming found no way to the
    // target — which it cannot rule out, having only ever looked at the branches
    // reachable from one position, or its level zero's bound ran out there
    // (`SearchOptions.resumeFrom`). The scene as a whole still has to be
    // searched before anything is reported about it.
    route = planRouteTo();
  }
  if (!route) {
    // No route to this start point exists at all — a definite answer, and the
    // one most worth passing on: a client that repeats this search pays the
    // same (unbounded until the work ceiling) cost to reach the same verdict.
    //
    // Asked immediately after the search that failed, because the planner's
    // account of how it ended is what separates "there is no way there" from
    // "I gave up looking" — and only the first is the script's fault (#379).
    log.record({
      address: to,
      programId,
      reachedTarget: false,
      simulationFailure: game.describeFailedRouteSearch(to),
      // Nothing was replayed; an error that stopped the search is why.
      errors: game.searchErrors(),
      fromStart: searchedFromStart,
    });
    return undefined;
  }

  // What the resumption established is a bound on the replay too: a
  // checkpoint whose story stands past what the new program agrees with is
  // too deep for a replay to start from (`replayCheckpointIndex`, which can
  // lie past where the search resumed). A program that says nothing about
  // what it changed supplies no bound, and the replay decides as it always
  // has.
  const limits =
    resumption.validSteps == null
      ? undefined
      : {
          steps: resumption.validSteps,
          checkpoint:
            resumption.replayCheckpointIndex ??
            resumption.checkpointIndex ??
            -1,
        };
  const found = route;
  let checkpoint = simulate(() => game.replayPatchedRoute(found, limits));
  if (game.simulation !== "success" && resumedSearch) {
    // A resumed route replayed to somewhere other than the target. A search of
    // the whole scene may still find one that does not, and the verdict has to
    // be the one that search reaches rather than the one a shortcut stopped at.
    const fromTop = planRouteTo();
    if (fromTop) {
      route = fromTop;
      checkpoint = simulate(() =>
        game.replayPatchedRoute(fromTop, { steps: 0, checkpoint: -1 }),
      );
    }
  }
  return finish(route, checkpoint);
};
