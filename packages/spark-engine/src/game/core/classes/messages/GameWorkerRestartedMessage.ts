import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";
import type { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";
import type { DocumentLocation } from "../../types/DocumentLocation";

export type GameWorkerRestartedMethod = typeof GameWorkerRestartedMessage.method;

export interface GameWorkerRestartedParams {
  /** What happened, for the author, naming the line. */
  message: string;
  /** The line the script was running when the worker was restarted, if the
   *  worker could say. */
  location: DocumentLocation | null;
  /** Whether PLAY's game or the stopped preview was running it. */
  during: "play" | "preview";
}

/**
 * The player restarted its worker because the script it was running did not
 * yield (#679): a loop that never ends, or one that runs on for longer than
 * the player waits. PLAY, if it was running, has stopped, and the preview
 * does not run that line again until the script changes.
 */
export class GameWorkerRestartedMessage {
  static readonly method = "game/workerRestarted";
  static readonly type = new MessageProtocolNotificationType<
    GameWorkerRestartedMethod,
    GameWorkerRestartedParams
  >(GameWorkerRestartedMessage.method);
}

export namespace GameWorkerRestartedMessage {
  export interface Notification extends NotificationMessage<
    GameWorkerRestartedMethod,
    GameWorkerRestartedParams
  > {}
}
