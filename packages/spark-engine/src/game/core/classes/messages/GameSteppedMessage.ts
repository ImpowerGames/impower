import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";
import type { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";
import type { DocumentLocation } from "../../types/DocumentLocation";

export type GameSteppedMethod = typeof GameSteppedMessage.method;

export interface GameSteppedParams {
  location: DocumentLocation;
  run?: number;
}

export class GameSteppedMessage {
  static readonly method = "game/stepped";
  static readonly type = new MessageProtocolNotificationType<
    GameSteppedMethod,
    GameSteppedParams
  >(GameSteppedMessage.method);
}

export namespace GameSteppedMessage {
  export interface Notification extends NotificationMessage<
    GameSteppedMethod,
    GameSteppedParams
  > {}
}
