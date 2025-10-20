import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/classes/MessageProtocolNotificationType";
import { NotificationMessage } from "@impower/jsonrpc/src/types/NotificationMessage";

export type GameExitedThreadMethod = typeof GameExitedThreadMessage.method;

export interface GameExitedThreadParams {
  /**
   * The identifier of the thread.
   */
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
  export interface Notification
    extends NotificationMessage<
      GameExitedThreadMethod,
      GameExitedThreadParams
    > {}
}
