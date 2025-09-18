import { NotificationMessage } from "../../types/base/NotificationMessage";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type GameWillSimulateFromMethod =
  typeof GameWillSimulateFromMessage.method;

export interface GameWillSimulateFromParams {
  simulateFrom?: { file: string; line: number } | null;
}

export class GameWillSimulateFromMessage {
  static readonly method = "game/willSimulateFrom";
  static readonly type = new MessageProtocolNotificationType<
    GameWillSimulateFromMethod,
    GameWillSimulateFromParams
  >(GameWillSimulateFromMessage.method);
}

export namespace GameWillSimulateFromMessage {
  export interface Notification
    extends NotificationMessage<
      GameWillSimulateFromMethod,
      GameWillSimulateFromParams
    > {}
}
