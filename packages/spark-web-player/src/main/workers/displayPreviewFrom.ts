import type { StoredCheckpoint } from "@impower/spark-engine/src/game/core/classes/CheckpointStore";
import type { Message } from "@impower/jsonrpc/src/common/types/Message";
import type { PreviewRoute } from "@impower/spark-engine/src/game/core/types/PreviewRoute";
import type { ProgramAddress } from "@impower/sparkdown/src/compiler/types/ProgramAddress";
import type { SimulationFailure } from "@impower/sparkdown/src/compiler/types/SimulationFailure";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { resolvePreviewPoint, type PreviewFrom } from "./resolvePreviewPoint";

export interface DisplayingGame {
  readonly state: string;
  readonly previewFrom: PreviewFrom | undefined;
  readonly previewAddress: ProgramAddress | undefined;
  readonly previewedAddress: ProgramAddress | undefined;
  reportsExecutedLines: boolean;
  simulateFlow: string | null | undefined;
  simulation: string | undefined;
  simulationFailure: SimulationFailure | undefined;
  previewRoute: PreviewRoute | undefined;
  markPreviewing(previewAddress?: ProgramAddress): void;
  routeStartOf(address: ProgramAddress): string;
  endSimulation(): void;
  load(checkpoint: string): unknown;
  loadCheckpoint(checkpoint: StoredCheckpoint): unknown;
  connect(
    send: (message: Message, transfer?: ArrayBuffer[]) => void,
  ): Promise<void>;
  redisplay?(
    send: (message: Message, transfer?: ArrayBuffer[]) => void,
  ): Promise<void>;
  beatOnlyRefusal?(cursor: ProgramAddress | null | undefined): string | null;
  preview(
    file: string,
    line: number,
    runFrom?: ProgramAddress,
    address?: ProgramAddress,
  ): Promise<ProgramAddress | null>;
  module: { ui: { forgetDisplayedImages(): void; sweepReconcile(): void } };
}

export type DisplayPath =
  | { beatOnly: true }
  | { beatOnly: false; refused: string };

export interface DisplayRequest {
  program: SparkProgram;
  programChanged: boolean;
  file: string;
  line: number;
  address?: ProgramAddress;
  relocate?: (from: PreviewFrom) => PreviewFrom;
  speculative: boolean;
  checkpoint?: string | StoredCheckpoint;
  simulationFailure?: SimulationFailure;
  route?: PreviewRoute;
  runFrom?: ProgramAddress;
  beatOnly?: true | string;
  onPath?: (path: DisplayPath) => void;
  send: (message: Message, transfer?: ArrayBuffer[]) => void;
  superseded: () => boolean;
}

export async function displayPreviewFrom(
  game: DisplayingGame,
  request: DisplayRequest,
): Promise<boolean> {
  const { program, programChanged, speculative, send, superseded } = request;
  const point = resolvePreviewPoint(
    program,
    { file: request.file, line: request.line, address: request.address },
    programChanged,
    game,
    request.relocate,
  );
  const validPreviewFrom = point.from;
  const resolvedPreviewAddress = point.address;
  const validPreviewAddress = point.validAddress;

  if (point.repeat) {
    await game.preview(
      validPreviewFrom.file,
      validPreviewFrom.line,
      undefined,
      validPreviewFrom.address,
    );
    if (superseded()) {
      return false;
    }
    game.module.ui.sweepReconcile();
    return true;
  }

  const path = classifyPath(game, request, resolvedPreviewAddress);
  request.onPath?.(path);

  game.reportsExecutedLines = !speculative;
  game.markPreviewing(resolvedPreviewAddress ?? undefined);
  game.module.ui.forgetDisplayedImages();
  game.endSimulation();
  const checkpoint = request.checkpoint;
  game.previewRoute = checkpoint ? request.route : undefined;
  if (typeof checkpoint === "string" && checkpoint) {
    game.load(checkpoint);
  } else if (checkpoint && typeof checkpoint === "object") {
    game.loadCheckpoint(checkpoint);
  } else {
    if (validPreviewAddress != null) {
      game.simulateFlow = game.routeStartOf(validPreviewAddress);
    }
    game.simulation = "fail";
    game.simulationFailure = request.simulationFailure;
  }
  if (path.beatOnly) {
    await game.redisplay!(send);
  } else {
    await game.connect(send);
  }
  if (superseded()) {
    return false;
  }
  await game.preview(
    validPreviewFrom.file,
    validPreviewFrom.line,
    request.runFrom,
    validPreviewFrom.address,
  );
  if (superseded()) {
    return false;
  }
  game.module.ui.sweepReconcile();
  return true;
}

function classifyPath(
  game: DisplayingGame,
  request: DisplayRequest,
  cursor: ProgramAddress | null | undefined,
): DisplayPath {
  if (request.beatOnly !== true) {
    return { beatOnly: false, refused: request.beatOnly ?? "unoffered" };
  }
  if (!game.redisplay || !game.beatOnlyRefusal) {
    return { beatOnly: false, refused: "unoffered" };
  }
  const refused = game.beatOnlyRefusal(cursor);
  return refused ? { beatOnly: false, refused } : { beatOnly: true };
}
