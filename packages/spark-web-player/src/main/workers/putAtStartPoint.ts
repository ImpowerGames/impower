import type { ProgramAddress } from "@impower/sparkdown/src/compiler/types/ProgramAddress";
import type { SimulationError } from "@impower/sparkdown/src/compiler/types/SimulationError";
import type { SimulationFailure } from "@impower/sparkdown/src/compiler/types/SimulationFailure";
import { profile } from "../../utils/profile";
import { programIdentity, type IdentifiableProgram } from "../../utils/programIdentity";

export interface StartPointRoute {
  checkpoint?: string;
  address?: ProgramAddress | null;
  programId?: string;
  failure?: SimulationFailure;
  errors?: SimulationError[];
}

export interface StartableGame {
  readonly program: IdentifiableProgram;
  readonly startAddress: ProgramAddress | null | undefined;
  simulateFlow: string | null | undefined;
  routeStartOf(address: ProgramAddress): string;
  simulation: string | undefined;
  simulationFailure: SimulationFailure | undefined;
  readonly routeErrors: SimulationError[];
  load(checkpoint: string): boolean;
  simulate(): unknown;
}

export function putAtStartPoint(
  game: StartableGame,
  route: StartPointRoute | undefined,
  profilerId?: string,
): SimulationError[] {
  const mark = (profilerId ? profilerId + " " : "") + "game/simulate";
  profile("start", mark);
  const {
    checkpoint,
    address: simulatedAddress,
    programId,
    failure,
    errors,
  } = route ?? {};
  let raised: SimulationError[] = [];
  const startAddress = game.startAddress;
  const answersThisRun =
    startAddress != null &&
    simulatedAddress === startAddress &&
    programId != null &&
    programId === programIdentity(game.program);
  if (answersThisRun) {
    if (checkpoint) {
      if (game.load(checkpoint)) {
        raised = errors ?? [];
      } else {
        game.simulate();
        raised = game.routeErrors;
      }
    } else {
      game.simulateFlow = game.routeStartOf(startAddress);
      game.simulation = "fail";
      game.simulationFailure = failure;
      raised = errors ?? [];
    }
  } else {
    game.simulate();
    raised = game.routeErrors;
  }
  profile("end", mark);
  return raised;
}
