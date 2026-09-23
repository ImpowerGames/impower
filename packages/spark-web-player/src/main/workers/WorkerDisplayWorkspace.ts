import type { WorkerGameLink } from "./WorkerGameLink";

/** What the player's workspace offers the controller for a preview displayed
 *  from the worker's game, and a PLAY run there. */
export interface WorkerDisplayWorkspace {
  /** The stopped preview is displayed from the worker's game, PLAY runs in
   *  the worker, and compiles answer with each program's summary. */
  workerDisplaysPreview: boolean;
  /** The page's end of the worker's games. */
  gameLink: WorkerGameLink;
  /** Tell the worker the page took the summary of the real program named by
   *  `programIdentity` (`player/programHeld`); settles once the worker has
   *  let go of what that leaves unneeded. */
  programHeld(program: string): Promise<void>;
}
