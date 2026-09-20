import { Game } from "@impower/spark-engine/src/game/core/classes/Game";
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
 *  later PLAY reuses, and not the choices the next real route would favor. */
export const searchRouteTo = (
  game: Game,
  toPath: string,
  log: RouteSearchLog,
  settings: RouteSearchSettings,
): string | undefined => {
  const { config, profilerId, remember = true } = settings;
  profile("start", profilerId + " " + "game/planRoute");
  const fromPath = Game.getSimulateFromPath(toPath);
  const newRoute = Game.planRoute(
    game.story,
    game.program,
    fromPath,
    toPath,
    config.simulationOptions,
    // `patchAndSimulateRoute` below loads a checkpoint or jumps to the route's
    // start, so a route found here can be left where the search stopped rather
    // than resetting the story into a state nothing reads.
    { callerResetsStory: true },
  );
  profile("end", profilerId + " " + "game/planRoute");
  const programId = programIdentity(game.program);
  if (!newRoute) {
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
  profile("start", profilerId + " " + "game/simulateRoute");
  const checkpoint = game.patchAndSimulateRoute(newRoute);
  profile("end", profilerId + " " + "game/simulateRoute");
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
    config.simulationOptions[newRoute.fromPath] = {
      favoredConditions,
      favoredChoices,
    };
  }
  return checkpoint ?? undefined;
};
