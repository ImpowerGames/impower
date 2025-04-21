import { NotificationMessage } from "../../types/base/NotificationMessage";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type GameResizedMethod = typeof GameResizedMessage.method;

export interface GameResizedParams {
  width: number;
  height: number;
}

export class GameResizedMessage {
  static readonly method = "game/resized";
  static readonly type = new MessageProtocolNotificationType<
    GameResizedMethod,
    GameResizedParams
  >(GameResizedMessage.method);
}

export namespace GameResizedMessage {
  export interface Notification
    extends NotificationMessage<GameResizedMethod, GameResizedParams> {}
}
