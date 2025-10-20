import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/classes/MessageProtocolNotificationType";
import { NotificationMessage } from "@impower/jsonrpc/src/types/NotificationMessage";

export type GameStartedMethod = typeof GameStartedMessage.method;

export interface GameStartedParams {}

export class GameStartedMessage {
  static readonly method = "game/started";
  static readonly type = new MessageProtocolNotificationType<
    GameStartedMethod,
    GameStartedParams
  >(GameStartedMessage.method);
}

export namespace GameStartedMessage {
  export interface Notification
    extends NotificationMessage<GameStartedMethod, GameStartedParams> {}
}
