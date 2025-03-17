import { NotificationMessage } from "../../types/base/NotificationMessage";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type GameStartedThreadMethod = typeof GameStartedThreadMessage.method;

export interface GameStartedThreadParams {
  /**
   * The identifier of the thread.
   */
  threadId: number;
}

export class GameStartedThreadMessage {
  static readonly method = "game/startedThread";
  static readonly type = new MessageProtocolNotificationType<
    GameStartedThreadMethod,
    GameStartedThreadParams
  >(GameStartedThreadMessage.method);
}

export namespace GameStartedThreadMessage {
  export interface Notification
    extends NotificationMessage<
      GameStartedThreadMethod,
      GameStartedThreadParams
    > {}
}
