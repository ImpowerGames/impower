import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";
import type { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";
import type { GameFit } from "./ResizeGameMessage";

export type GameResizedMethod = typeof GameResizedMessage.method;

export interface GameResizedParams {
  width: number;
  height: number;
  aspectRatio: string | null;
  fit: GameFit;
}

export class GameResizedMessage {
  static readonly method = "game/resized";
  static readonly type = new MessageProtocolNotificationType<
    GameResizedMethod,
    GameResizedParams
  >(GameResizedMessage.method);
}

export namespace GameResizedMessage {
  export interface Notification extends NotificationMessage<
    GameResizedMethod,
    GameResizedParams
  > {}
}
