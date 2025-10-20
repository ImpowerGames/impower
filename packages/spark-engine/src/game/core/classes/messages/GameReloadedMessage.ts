import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/classes/MessageProtocolNotificationType";
import { NotificationMessage } from "@impower/jsonrpc/src/types/NotificationMessage";

export type GameReloadedMethod = typeof GameReloadedMessage.method;

export interface GameReloadedParams {}

export class GameReloadedMessage {
  static readonly method = "game/reloaded";
  static readonly type = new MessageProtocolNotificationType<
    GameReloadedMethod,
    GameReloadedParams
  >(GameReloadedMessage.method);
}

export namespace GameReloadedMessage {
  export interface Notification
    extends NotificationMessage<GameReloadedMethod, GameReloadedParams> {}
}
