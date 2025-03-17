import { NotificationMessage } from "../../types/base/NotificationMessage";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

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
