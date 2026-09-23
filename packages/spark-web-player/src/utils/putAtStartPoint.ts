import { Game } from "@impower/spark-engine/src/game/core/classes/Game";
import type { SimulationFailure } from "@impower/sparkdown/src/compiler/types/SimulationFailure";
import { profile } from "./profile";
import { programIdentity, type IdentifiableProgram } from "./programIdentity";

/** What a route search established about a start point, as the worker
 *  reports it. */
export interface StartPointRoute {
  checkpoint?: string;
  /** The path the search was for, or null for one it resolved to nothing. */
  path?: string | null;
  /** The program the search ran in. */
  programId?: string;
  failure?: SimulationFailure;
}

/** The game, as far as putting it at its start point needs it. Structural so
 *  the rule can be checked against a recording stand-in. */
export interface StartableGame {
  readonly program: IdentifiableProgram;
  readonly startPath: string | null | undefined;
  simulatePath: string | null | undefined;
  simulation: string | undefined;
  simulationFailure: SimulationFailure | undefined;
  load(checkpoint: string): boolean;
  simulate(
    simulationOptions?: Record<
      string,
      {
        favoredChoices?: (number | undefined)[];
        favoredConditions?: (boolean | undefined)[];
      }
    >,
  ): unknown;
}

/**
 * Put PLAY's game at the start point it was asked to begin from, from the
 * route the worker's search established, wherever the game runs.
 *
 * Reaching that point means replaying the story to it, and finding a replay
 * that gets there is a search that can run for many seconds on a story it
 * never reaches. On the thread that paints the player, a search is a frozen
 * page for as long as it lasts (#385); in the worker, it holds up the game.
 *
 * The worker already runs that identical search, on every compile and every
 * cursor move, and reports the paths it reached a definite answer about
 * (`path`): either the story state at that path (`checkpoint`), or, with no
 * checkpoint, that no route to it exists. When that answer is about the same
 * start point this run begins from, and about the same program this run is
 * built from, there is nothing left to look for. Anything less definite is
 * treated as no answer at all, and the search runs on the game, which is safe
 * because the only case that reaches it is one where a route was already
 * found to exist.
 */
export function putAtStartPoint(
  game: StartableGame,
  simulationOptions:
    | Record<
        string,
        {
          favoredChoices?: (number | undefined)[];
          favoredConditions?: (boolean | undefined)[];
        }
      >
    | undefined,
  route: StartPointRoute | undefined,
  /** Names the thread that runs the rule in its profile marks. */
  profilerId?: string,
): void {
  const mark = (profilerId ? profilerId + " " : "") + "game/simulate";
  profile("start", mark);
  const { checkpoint, path: simulatedPath, programId, failure } = route ?? {};
  const startPath = game.startPath;
  // Both halves are required. The path says where the answer is about; the
  // program identity says what script it is about, which the path cannot:
  // the same path string survives an edit that changes what the story does
  // at it, and a compile landing while PLAY is being set up leaves the
  // worker an edit ahead of the program the game was built from. A mismatch
  // is not an error: the answer does not apply, so the search runs.
  const answersThisRun =
    startPath != null &&
    simulatedPath === startPath &&
    programId != null &&
    programId === programIdentity(game.program);
  if (answersThisRun) {
    if (checkpoint) {
      // The worker found the route and replayed it; its checkpoint is the
      // state that replay ends in, and loading it marks the simulation
      // successful, as a search on the game would have left it.
      //
      // A checkpoint that will not load (a truncated or malformed save) is
      // searched for after all: the worker reaching this start point proves
      // a route exists, so the search finds one and ends.
      if (!game.load(checkpoint)) {
        game.simulate(simulationOptions);
      }
    } else {
      // No route to this start point exists. Searching again would reach
      // the same verdict, so the failure is recorded as a search would
      // record it, and `start` falls back to jumping straight to the start
      // point. The toolbar then reports an unreachable start point, and why,
      // as it does for the preview.
      game.simulatePath = Game.getSimulateFromPath(startPath);
      game.simulation = "fail";
      game.simulationFailure = failure;
    }
  } else {
    // No worker answer applies to this run: nothing was ever selected, the
    // worker resolved a different path, or it answered for a different
    // version of the script. This is the only search there is.
    game.simulate(simulationOptions);
  }
  profile("end", mark);
}
