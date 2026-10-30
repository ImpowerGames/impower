import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";
import type { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";
import type { DocumentLocation } from "../../types/DocumentLocation";

export type GameWorkerRestartedMethod = typeof GameWorkerRestartedMessage.method;

export interface GameWorkerRestartedParams {
  message: string;
  location: DocumentLocation | null;
  during: "play" | "preview";
}

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
