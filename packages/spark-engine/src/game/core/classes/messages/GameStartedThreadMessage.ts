import { MessageProtocolNotificationType } from "../../../../protocol/classes/MessageProtocolNotificationType";
import { NotificationMessage } from "../../../../protocol/types/NotificationMessage";

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
