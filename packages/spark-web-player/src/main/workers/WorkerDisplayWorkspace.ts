import type { ProgramForPlayResult } from "./messages/ProgramForPlayMessage";
import type { WorkerGameLink } from "./WorkerGameLink";

/** What the player's workspace offers the controller for a preview displayed
 *  from the worker's game. */
export interface WorkerDisplayWorkspace {
  /** The stopped preview is displayed from the worker's game, and compiles
   *  answer with each program's summary. */
  workerDisplaysPreview: boolean;
  /** The page's end of the worker's game. */
  gameLink: WorkerGameLink;
  /** The whole program the page holds the summary of, named by
   *  `programIdentity`, for PLAY's page-resident game, with the route the
   *  worker replayed to `startFrom`. */
  programForPlay(
    program: string,
    startFrom: { file: string; line: number } | undefined,
  ): Promise<ProgramForPlayResult>;
  /** Tell the worker the page took the summary of the real program named by
   *  `programIdentity` (`player/programHeld`); settles once the worker has
   *  let go of what that leaves unneeded. */
  programHeld(program: string): Promise<void>;
}
