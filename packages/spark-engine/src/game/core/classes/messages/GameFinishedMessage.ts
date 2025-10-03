import { MessageProtocolNotificationType } from "../../../../protocol/classes/MessageProtocolNotificationType";
import { NotificationMessage } from "../../../../protocol/types/NotificationMessage";

export type GameFinishedMethod = typeof GameFinishedMessage.method;

export interface GameFinishedParams {}

export class GameFinishedMessage {
  static readonly method = "game/finished";
  static readonly type = new MessageProtocolNotificationType<
    GameFinishedMethod,
    GameFinishedParams
  >(GameFinishedMessage.method);
}

export namespace GameFinishedMessage {
  export interface Notification
    extends NotificationMessage<GameFinishedMethod, GameFinishedParams> {}
}
