import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";
import type { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";

export type GameExitedThreadMethod = typeof GameExitedThreadMessage.method;

export interface GameExitedThreadParams {
  threadId: number;
}

export class GameExitedThreadMessage {
  static readonly method = "game/exitedThread";
  static readonly type = new MessageProtocolNotificationType<
    GameExitedThreadMethod,
    GameExitedThreadParams
  >(GameExitedThreadMessage.method);
}

export namespace GameExitedThreadMessage {
  export interface Notification extends NotificationMessage<
    GameExitedThreadMethod,
    GameExitedThreadParams
  > {}
}
