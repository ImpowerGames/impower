import { MessageProtocolNotificationType } from "../../../../protocol/classes/MessageProtocolNotificationType";
import { NotificationMessage } from "../../../../protocol/types/NotificationMessage";

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
