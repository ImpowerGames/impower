import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/classes/MessageProtocolNotificationType";
import { NotificationMessage } from "@impower/jsonrpc/src/types/NotificationMessage";

export type GameSteppedMethod = typeof GameSteppedMessage.method;

export interface GameSteppedParams {}

export class GameSteppedMessage {
  static readonly method = "game/stepped";
  static readonly type = new MessageProtocolNotificationType<
    GameSteppedMethod,
    GameSteppedParams
  >(GameSteppedMessage.method);
}

export namespace GameSteppedMessage {
  export interface Notification
    extends NotificationMessage<GameSteppedMethod, GameSteppedParams> {}
}
