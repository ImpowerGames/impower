import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";
import type { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";
import type { DocumentLocation } from "@impower/spark-engine/src/game/core/types/DocumentLocation";

export type WorkerBusyMethod = typeof WorkerBusyMessage.method;

export interface WorkerBusyParams {
  busyMs: number;
  location: DocumentLocation | null;
  routingTo: { file: string; line: number } | null;
}

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
