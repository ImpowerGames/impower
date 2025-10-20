import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/classes/MessageProtocolNotificationType";
import { NotificationMessage } from "@impower/jsonrpc/src/types/NotificationMessage";

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
