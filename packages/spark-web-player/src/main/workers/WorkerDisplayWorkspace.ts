import type { DocumentLocation } from "@impower/spark-engine/src/game/core/types/DocumentLocation";
import type { WorkerGameLink } from "./WorkerGameLink";

/** A point of a script the preview can be asked to show. */
export interface PreviewPoint {
  file: string;
  line: number;
}

/** The player's worker ran a story without yielding for longer than the
 *  page waits (`WorkerWatchdog`), and is being restarted (#679). */
export interface WorkerHang {
  /** How long the story had run without yielding, in milliseconds. */
  busyMs: number;
  /** The line it was running, if the worker could say. */
  location: DocumentLocation | null;
  /** Settles once the restarted worker has been given the project and has
   *  compiled it. */
  restarted: Promise<void>;
}

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
  /** Hear each time the worker is restarted because a story ran in it
   *  without yielding. A listener is called before any request still waiting
   *  on the old worker is settled, and may set points aside. */
  addWorkerHangListener(listener: (hang: WorkerHang) => void): () => void;
  /** Keep the worker from running a route to `point` again, as a selection
   *  or a compile would, until the project next changes: a preview of it is
   *  what stopped the worker answering. */
  setAside(point: PreviewPoint): void;
  /** `point` is set aside (`setAside`). */
  isSetAside(point: PreviewPoint): boolean;
}
