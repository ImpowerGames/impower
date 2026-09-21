import type { CompiledProgramParams } from "@impower/sparkdown/src/compiler/classes/messages/CompiledProgramMessage";
import type { WorkerGameLink } from "./WorkerGameLink";

/** What the player's workspace offers the controller for a preview displayed
 *  from the worker's game. */
export interface WorkerDisplayWorkspace {
  /** The stopped preview is displayed from the worker's game, and compiles
   *  answer with each program's summary. */
  workerDisplaysPreview: boolean;
  /** The page's end of the worker's game. */
  gameLink: WorkerGameLink;
  /** The whole program at the selection, for PLAY's page-resident game, with
   *  the route the worker replayed to it. */
  compileForPlay(uri: string): Promise<CompiledProgramParams>;
}
