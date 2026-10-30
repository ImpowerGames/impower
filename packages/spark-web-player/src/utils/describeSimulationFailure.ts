import type { GameExecutedParams } from "@impower/spark-engine/src/game/core/classes/messages/GameExecutedMessage";
import type { SimulationFailure } from "@impower/sparkdown/src/compiler/types/SimulationFailure";

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

export const UNEXPLAINED_SIMULATION_FAILURE =
  "Couldn't simulate a way to reach this line.";

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
