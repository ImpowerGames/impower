import { GameExecutedParams } from "@impower/spark-engine/src/game/core/classes/messages/GameExecutedMessage";
import { SimulationFailure } from "@impower/sparkdown/src/compiler/types/SimulationFailure";

/**
 * What the status bar says when it could not simulate a way to the line the
 * author is previewing from.
 *
 * The row already shows WHICH lines were involved — `main : 12 → 🞪 → main : 480`
 * — so each message only has to say why, and what the author can do about it.
 * They are kept short and certain on purpose: the previous single message had
 * to hedge between causes the engine could not tell apart, and a hedge here
 * sends an author off to restructure a script that is fine.
 */
export const SIMULATION_FAILURE_MESSAGES: Record<SimulationFailure, string> = {
  timeout:
    "Ran out of time when searching for a route to this line. " +
    "Possibly because of an infinite loop or a scene that is too long.",
  exhausted:
    "No path through this scene reaches this line. " +
    "A condition or choice may always skip it.",
  unroutable: "There's nothing to preview on this line.",
  diverged:
    "Found a route to this line, but replaying it stopped short of getting there.",
  errored: "Something went wrong while searching for a route to this line.",
};

/** Said when the row is in its failed state but no cause came with it, so that
 *  hovering always explains something rather than nothing. Reaching this means
 *  a failure the engine does not yet name, not a healthy preview. */
export const UNEXPLAINED_SIMULATION_FAILURE =
  "Couldn't simulate a way to reach this line.";

/**
 * The tooltip for a status row, or `null` when there is nothing to explain.
 *
 * Returns `null` for every non-failing state so the caller has a single answer
 * to act on: text means "show this", `null` means "remove whatever is there".
 */
export const describeSimulationFailure = (
  simulation: GameExecutedParams["simulation"],
  simulationFailure: SimulationFailure | undefined,
): string | null => {
  if (simulation !== "fail") {
    return null;
  }
  return (
    (simulationFailure && SIMULATION_FAILURE_MESSAGES[simulationFailure]) ||
    UNEXPLAINED_SIMULATION_FAILURE
  );
};
