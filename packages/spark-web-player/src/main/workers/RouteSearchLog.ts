import type { StoredCheckpoint } from "@impower/spark-engine/src/game/core/classes/CheckpointStore";
import type {
  PreviewRoute,
  RunMenu,
} from "@impower/spark-engine/src/game/core/types/PreviewRoute";
import type { ProgramAddress } from "@impower/sparkdown/src/compiler/types/ProgramAddress";
import type { SimulationError } from "@impower/sparkdown/src/compiler/types/SimulationError";
import type { SimulationFailure } from "@impower/sparkdown/src/compiler/types/SimulationFailure";

export interface RouteSearchOutcome {
  address: ProgramAddress;
  programId?: string;
  reachedTarget: boolean;
  checkpoint?: string | StoredCheckpoint;
  simulationFailure?: SimulationFailure;
  errors?: SimulationError[];
  shows?: boolean;
  route?: PreviewRoute;
  menus?: RunMenu[];
  fromStart?: boolean;
  jumpShows?: boolean;
  shown?: {
    point: { file: string; line: number };
    outcome: RouteSearchOutcome;
  };
}

export interface RouteSearchReportTarget {
  checkpoint?: string;
  simulatedAddress?: ProgramAddress | null;
  simulatedProgramId?: string;
  simulationFailure?: SimulationFailure;
  simulationErrors?: SimulationError[];
}

export class RouteSearchLog {
  protected _last: RouteSearchOutcome | null = null;

  get last(): RouteSearchOutcome | null {
    return this._last;
  }

  forget(): void {
    this._last = null;
  }

  record(outcome: RouteSearchOutcome): void {
    this._last = outcome;
  }

  holds(address: ProgramAddress, programId: string | undefined): boolean {
    const last = this._last;
    return (
      last !== null && last.address === address && last.programId === programId
    );
  }

  outcomeFor(
    address: ProgramAddress | null | undefined,
  ): RouteSearchOutcome | undefined {
    const last = this._last;
    return last && last.address === address ? last : undefined;
  }

  checkpointFor(
    startAddress: ProgramAddress | null | undefined,
  ): string | StoredCheckpoint | undefined {
    const last = this._last;
    if (!last || last.address !== startAddress) {
      return undefined;
    }
    return last.checkpoint || undefined;
  }

  report(
    params: RouteSearchReportTarget,
    startAddress: ProgramAddress | null | undefined,
  ): void {
    const last = this._last;
    if (!last || last.address !== startAddress) {
      return;
    }
    if (typeof last.checkpoint === "string" && last.checkpoint) {
      params.checkpoint = last.checkpoint;
    }
    if (last.reachedTarget || !last.checkpoint) {
      params.simulatedAddress = last.address;
      params.simulatedProgramId = last.programId;
    }
    params.simulationFailure = last.simulationFailure;
    params.simulationErrors = last.errors ?? [];
  }
}
