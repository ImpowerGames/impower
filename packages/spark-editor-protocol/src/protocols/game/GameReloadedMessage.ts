import { NotificationMessage } from "../../types/base/NotificationMessage";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

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
