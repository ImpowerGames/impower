import type { StoredCheckpoint } from "@impower/spark-engine/src/game/core/classes/CheckpointStore";
import type { Message } from "@impower/jsonrpc/src/common/types/Message";
import type { ProgramAddress } from "@impower/sparkdown/src/compiler/types/ProgramAddress";
import type { SimulationFailure } from "@impower/sparkdown/src/compiler/types/SimulationFailure";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { resolvePreviewPoint } from "./resolvePreviewPoint";

/** The game, as far as a display needs it. Structural so the order of the
 *  steps can be checked against a recording stand-in. */
export interface DisplayingGame {
  readonly state: string;
  readonly previewFrom: { file: string; line: number } | undefined;
  readonly previewAddress: ProgramAddress | undefined;
  readonly previewedAddress: ProgramAddress | undefined;
  reportsExecutedLines: boolean;
  simulateFlow: string | null | undefined;
  simulation: string | undefined;
  simulationFailure: SimulationFailure | undefined;
  markPreviewing(previewAddress?: ProgramAddress): void;
  routeStartOf(address: ProgramAddress): string;
  endSimulation(): void;
  load(checkpoint: string): unknown;
  loadCheckpoint(checkpoint: StoredCheckpoint): unknown;
  connect(
    send: (message: Message, transfer?: ArrayBuffer[]) => void,
  ): Promise<void>;
  connectInPlace(
    send: (message: Message, transfer?: ArrayBuffer[]) => void,
  ): Promise<boolean>;
  preview(file: string, line: number): Promise<ProgramAddress | null>;
  module: {
    ui: {
      forgetDisplayedImages(): void;
      sweepReconcile(): void;
      settleInPlace(): void;
      recordDisplayed(): void;
    };
  };
}

export interface DisplayRequest {
  /** The program the game holds, which the display is for. */
  program: SparkProgram;
  /** The game did not display this program last. */
  programChanged: boolean;
  file: string;
  line: number;
  speculative: boolean;
  /** The route to the point: its checkpoint when it was replayed, and why
   *  not when it was not. The worker's route hands the checkpoint over as
   *  the value its game holds, which loads in place; a full save loads as a
   *  save. */
  checkpoint?: string | StoredCheckpoint;
  simulationFailure?: SimulationFailure;
  /** The page shows the game's last display, and nothing but the statement
   *  under the cursor changed since (`classifyDisplay`): the game returns
   *  the page to the checkpoint's state where it differs and previews,
   *  rather than connecting and closing a reconcile pass (#657). Taken only
   *  once the route's checkpoint value has loaded. */
  inPlace?: boolean;
  /** Where the game sends the page what it displays. */
  send: (message: Message, transfer?: ArrayBuffer[]) => void;
  /** A later display, or a compile, took the game over. */
  superseded: () => boolean;
}

/**
 * Display a program's preview at a point from the worker's game. Answers
 * whether this display's frame is complete on the page: false when something
 * took it over while it waited, in which case it neither previews nor sweeps.
 */
export async function displayPreviewFrom(
  game: DisplayingGame,
  request: DisplayRequest,
): Promise<boolean> {
  const { program, programChanged, speculative, send, superseded } = request;
  const point = resolvePreviewPoint(
    program,
    { file: request.file, line: request.line },
    programChanged,
    game,
  );
  const validPreviewFrom = point.from;
  const resolvedPreviewAddress = point.address;
  const validPreviewAddress = point.validAddress;

  if (point.repeat) {
    // A repeat of the preview that ran, whose image gate may still be
    // pending: the engine answers with the same promise.
    await game.preview(validPreviewFrom.file, validPreviewFrom.line);
    return !superseded();
  }

  // A suggestion's report is not relayed to the editors, so the game leaves
  // out what only they would read.
  game.reportsExecutedLines = !speculative;
  // Before the load and the connect: the connect restores every module, and
  // the audio module reads the mode there to decide whether to resume the
  // route's music.
  game.markPreviewing(resolvedPreviewAddress ?? undefined);
  // What the last preview displayed goes; the restore re-applies what this
  // point has.
  game.module.ui.forgetDisplayedImages();
  // The route search leaves the game simulating, and while it is, the
  // modules restore as a simulation does.
  game.endSimulation();
  const checkpoint = request.checkpoint;
  let loaded = false;
  if (typeof checkpoint === "string" && checkpoint) {
    game.load(checkpoint);
  } else if (checkpoint && typeof checkpoint === "object") {
    // No save is written of the route's checkpoint and read back (#1758).
    loaded = game.loadCheckpoint(checkpoint) === true;
  } else {
    if (validPreviewAddress != null) {
      game.simulateFlow = game.routeStartOf(validPreviewAddress);
    }
    game.simulation = "fail";
    game.simulationFailure = request.simulationFailure;
  }
  // Without the checkpoint the module state is not the route's, and the
  // page is put in it by the connect.
  const inPlace =
    request.inPlace === true && loaded && (await game.connectInPlace(send));
  if (!inPlace) {
    await game.connect(send);
  }
  if (superseded()) {
    return false;
  }
  // The preview waits for the beat's pictures before it writes the beat, so
  // the sweep waits for the preview.
  await game.preview(validPreviewFrom.file, validPreviewFrom.line);
  if (superseded()) {
    return false;
  }
  if (inPlace) {
    // The transient targets the beat did not write are cleared now, rather
    // than emptied before it and filled again.
    game.module.ui.settleInPlace();
  } else {
    game.module.ui.sweepReconcile();
  }
  // Everything this display shows has been sent: the next display can be
  // one in place.
  game.module.ui.recordDisplayed();
  return true;
}
