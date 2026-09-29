import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";
import type { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";
import type { DocumentLocation } from "@impower/spark-engine/src/game/core/types/DocumentLocation";

export type WorkerBusyMethod = typeof WorkerBusyMessage.method;

export interface WorkerBusyParams {
  /** How long the worker has been running stories without yielding, in
   *  milliseconds. */
  busyMs: number;
  /** The line the story it was running last stepped from, if the worker can
   *  say. */
  location: DocumentLocation | null;
  /** The point the worker was routing the preview to or displaying, when
   *  the story was a route's or a display's rather than PLAY's game. A route
   *  to it is what does not yield, so it is not to be routed to again. */
  routingTo: { file: string; line: number } | null;
}

/**
 * Sent by the player's worker while one stretch of story execution has run
 * without yielding for longer than `BUSY_NOTICE_AFTER_MS`, and again as it
 * goes on (`watchExecution`). A compile runs no story and sends none, so the
 * page can tell a script that never yields from a long compile (#679).
 */
export class WorkerBusyMessage {
  static readonly method = "player/busy";
  static readonly type = new MessageProtocolNotificationType<
    WorkerBusyMethod,
    WorkerBusyParams
  >(WorkerBusyMessage.method);
}

export namespace WorkerBusyMessage {
  export interface Notification extends NotificationMessage<
    WorkerBusyMethod,
    WorkerBusyParams
  > {}
}
