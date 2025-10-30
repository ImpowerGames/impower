import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";
import { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";

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
