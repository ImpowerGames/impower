import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";
import { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";
import { DocumentLocation } from "../../types/DocumentLocation";

export type GameExitedMethod = typeof GameExitedMessage.method;

export interface GameExitedParams {
  reason: "finished" | "quit" | "invalidated" | "error" | "restart";
  error?: {
    message: string;
    location: DocumentLocation;
  };
}

export class GameExitedMessage {
  static readonly method = "game/exited";
  static readonly type = new MessageProtocolNotificationType<
    GameExitedMethod,
    GameExitedParams
  >(GameExitedMessage.method);
}

export namespace GameExitedMessage {
  export interface Notification
    extends NotificationMessage<GameExitedMethod, GameExitedParams> {}
}
