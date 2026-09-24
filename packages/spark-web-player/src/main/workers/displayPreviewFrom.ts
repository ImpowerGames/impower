import type { Message } from "@impower/jsonrpc/src/common/types/Message";
import { Game } from "@impower/spark-engine/src/game/core/classes/Game";
import type { SimulationFailure } from "@impower/sparkdown/src/compiler/types/SimulationFailure";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { resolvePreviewPoint } from "./resolvePreviewPoint";

/** The game, as far as a display needs it. Structural so the order of the
 *  steps can be checked against a recording stand-in. */
export interface DisplayingGame {
  readonly state: string;
  readonly previewFrom: { file: string; line: number } | undefined;
  readonly previewPath: string | undefined;
  readonly previewedPath: string | undefined;
  reportsExecutedLines: boolean;
  simulatePath: string | null | undefined;
  simulation: string | undefined;
  simulationFailure: SimulationFailure | undefined;
  markPreviewing(previewPath?: string): void;
  endSimulation(): void;
  load(checkpoint: string): unknown;
  connect(
    send: (message: Message, transfer?: ArrayBuffer[]) => void,
  ): Promise<void>;
  preview(file: string, line: number): Promise<string | null>;
  module: { ui: { forgetDisplayedImages(): void; sweepReconcile(): void } };
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
   *  not when it was not. */
  checkpoint?: string;
  simulationFailure?: SimulationFailure;
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
  const resolvedPreviewPath = point.path;
  const validPreviewPath = point.validPath;

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
  game.markPreviewing(resolvedPreviewPath ?? undefined);
  // What the last preview displayed goes; the restore re-applies what this
  // point has.
  game.module.ui.forgetDisplayedImages();
  // The route search leaves the game simulating, and while it is, the
  // modules restore as a simulation does.
  game.endSimulation();
  if (request.checkpoint) {
    game.load(request.checkpoint);
  } else {
    if (validPreviewPath) {
      game.simulatePath = Game.getSimulateFromPath(validPreviewPath);
    }
    game.simulation = "fail";
    game.simulationFailure = request.simulationFailure;
  }
  await game.connect(send);
  if (superseded()) {
    return false;
  }
  // The preview waits for the beat's pictures before it writes the beat, so
  // the sweep waits for the preview.
  await game.preview(validPreviewFrom.file, validPreviewFrom.line);
  if (superseded()) {
    return false;
  }
  game.module.ui.sweepReconcile();
  return true;
}
