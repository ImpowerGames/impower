import type { WorkerGameLink } from "./WorkerGameLink";

/** What the player's workspace offers the controller for the preview the
 *  worker's game displays, and PLAY's game in the worker. Compiles answer the
 *  page with each program's summary. */
export interface WorkerDisplayWorkspace {
  /** The page's end of the worker's games. */
  gameLink: WorkerGameLink;
  /** Tell the worker the page took the summary of the real program named by
   *  `programIdentity` (`player/programHeld`); settles once the worker has
   *  let go of what that leaves unneeded. */
  programHeld(program: string): Promise<void>;
}
