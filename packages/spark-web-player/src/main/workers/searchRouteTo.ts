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
  fromStart?: boolean;
  startSearched?: boolean;
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
  profile("start", profilerId + " " + "game/routeResumption");
  const resumption = game.routeResumption(from, to);
  profile("end", profilerId + " " + "game/routeResumption");
  const plannedRoute = game.plannedRoute;

  const planRouteTo = (resumeFrom?: RouteResumePoint) => {
    profile("start", profilerId + " " + "game/planRoute");
    const budget = {
      callerResetsStory: true,
      resumeFrom,
      levelZeroStore: game.levelZeroStore,
      startPlans: game.startPlans,
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
    route = planRouteTo();
  }
  if (!route) {
    log.record({
      address: to,
      programId,
      reachedTarget: false,
      simulationFailure: game.describeFailedRouteSearch(to),
      errors: game.searchErrors(),
      fromStart: searchedFromStart,
    });
    return undefined;
  }

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
