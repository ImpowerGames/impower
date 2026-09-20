import { Game } from "@impower/spark-engine/src/game/core/classes/Game";
import type {
  RoutePlan,
  RouteResumePoint,
} from "@impower/sparkdown/src/compiler/utils/planRoute";
import { profile } from "../../utils/profile";
import { programIdentity } from "../../utils/programIdentity";
import type { RouteSearchLog } from "./RouteSearchLog";

type SimulationOptions = Record<
  string,
  {
    favoredConditions?: (boolean | undefined)[];
    favoredChoices?: (number | undefined)[];
  }
>;

export interface RouteSearchSettings {
  /** The compiler's configuration. Every search reads the choices it favors,
   *  and a search that remembers writes the ones its route took. */
  config: { simulationOptions?: SimulationOptions };
  profilerId?: string;
  /** False for a search the real program must not learn from. */
  remember?: boolean;
}

/** Plan a route to `toPath` and replay it, recording what the search
 *  established in `log`. Returns the checkpoint it produced, if any. A route
 *  replayed for a preview compile passes its own log and `remember: false`,
 *  so nothing it finds is kept for the real program: not the search record a
 *  later PLAY reuses, and not the choices the next real route would favor.
 *
 *  Most compiles arrive with a route already planned through the program before
 *  them, and most edits cannot have changed anything the story does ahead of
 *  the line being edited. So the work is arranged cheapest first: replay the
 *  route already planned; failing that, search onward from where it stopped
 *  being valid; failing that, search the scene from the top. The first two are
 *  attempts rather than decisions — either can come back empty or replay to
 *  somewhere other than the target, and the next one down then runs — so what
 *  is reported is always what a search from the top would have reported. */
export const searchRouteTo = (
  game: Game,
  toPath: string,
  log: RouteSearchLog,
  settings: RouteSearchSettings,
): string | undefined => {
  const { config, profilerId, remember = true } = settings;
  const fromPath = Game.getSimulateFromPath(toPath);
  // Asked before anything replaces the planned route, because every question it
  // answers is about that route. Measured under its own name: it walks the
  // route's steps and reads a checkpoint back, so it is work in its own right
  // and a reader comparing a before and an after needs to see it.
  profile("start", profilerId + " " + "game/routeResumption");
  const resumption = game.routeResumption(fromPath, toPath);
  profile("end", profilerId + " " + "game/routeResumption");
  const plannedRoute = game.plannedRoute;

  const planRouteTo = (resumeFrom?: RouteResumePoint) => {
    profile("start", profilerId + " " + "game/planRoute");
    const route = Game.planRoute(
      game.story,
      game.program,
      fromPath,
      toPath,
      config.simulationOptions,
      // `patchAndSimulateRoute` below loads a checkpoint or jumps to the route's
      // start, so a route found here can be left where the search stopped rather
      // than resetting the story into a state nothing reads.
      { callerResetsStory: true, resumeFrom },
    );
    profile("end", profilerId + " " + "game/planRoute");
    return route;
  };

  const simulate = (run: () => string | null) => {
    profile("start", profilerId + " " + "game/simulateRoute");
    const checkpoint = run();
    profile("end", profilerId + " " + "game/simulateRoute");
    return checkpoint;
  };

  const programId = programIdentity(game.program);
  const finish = (route: RoutePlan, checkpoint: string | null | undefined) => {
    const reachedTarget = game.simulation === "success";
    log.record({
      path: toPath,
      programId,
      reachedTarget,
      checkpoint: checkpoint ?? undefined,
      // A route existed, so any failure here happened during the replay rather
      // than the search; the game recorded which (`"diverged"`).
      simulationFailure: reachedTarget ? undefined : game.simulationFailure,
    });
    if (checkpoint && remember) {
      // Cache favored conditions and choices
      const conditions = game.runtimeState.conditionsEncountered;
      const choices = game.runtimeState.choicesEncountered;
      const favoredConditions = conditions.map((c) => c.selected);
      const favoredChoices = choices.map((c) => c.selected);
      config.simulationOptions ??= {};
      config.simulationOptions[route.fromPath] = {
        favoredConditions,
        favoredChoices,
      };
    }
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
      game.resumePlannedRoute(stepIndex, checkpointIndex),
    );
    if (game.simulation === "success") {
      return finish(plannedRoute, checkpoint);
    }
    // The route no longer ends where it ended. Everything below searches for
    // one that does.
  }

  let route: RoutePlan | null = null;
  let resumedSearch = false;
  if (resumption.resumeFrom) {
    route = planRouteTo(resumption.resumeFrom);
    resumedSearch = route != null;
  }
  if (!route) {
    // Either there was nothing to resume from, or resuming found no way to the
    // target — which it cannot rule out, having only ever looked at the branches
    // reachable from one position. The scene as a whole still has to be searched
    // before anything is reported about it.
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
      path: toPath,
      programId,
      reachedTarget: false,
      simulationFailure: Game.describeFailedRouteSearch(game.program, toPath),
    });
    return undefined;
  }

  // What the resumption established is a bound on the replay too: the same
  // checkpoint that was too deep for a search to resume from is too deep for a
  // replay to start from. A program that says nothing about what it changed
  // supplies no bound, and the replay decides as it always has.
  const limits =
    resumption.validSteps == null
      ? undefined
      : {
          steps: resumption.validSteps,
          checkpoint: resumption.checkpointIndex ?? -1,
        };
  const found = route;
  let checkpoint = simulate(() => game.patchAndSimulateRoute(found, limits));
  if (game.simulation !== "success" && resumedSearch) {
    // A resumed route replayed to somewhere other than the target. A search of
    // the whole scene may still find one that does not, and the verdict has to
    // be the one that search reaches rather than the one a shortcut stopped at.
    const fromTop = planRouteTo();
    if (fromTop) {
      route = fromTop;
      checkpoint = simulate(() =>
        game.patchAndSimulateRoute(fromTop, { steps: 0, checkpoint: -1 }),
      );
    }
  }
  return finish(route, checkpoint);
};
