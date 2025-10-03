import { MessageProtocolNotificationType } from "../../../../protocol/classes/MessageProtocolNotificationType";
import { NotificationMessage } from "../../../../protocol/types/NotificationMessage";

export type GameWillSimulateChoicesMethod =
  typeof GameWillSimulateChoicesMessage.method;

export interface GameWillSimulateChoicesParams {
  simulateChoices?: Record<string, number[]> | null;
}

export class GameWillSimulateChoicesMessage {
  static readonly method = "game/willSimulateChoices";
  static readonly type = new MessageProtocolNotificationType<
    GameWillSimulateChoicesMethod,
    GameWillSimulateChoicesParams
  >(GameWillSimulateChoicesMessage.method);
}

export namespace GameWillSimulateChoicesMessage {
  export interface Notification
    extends NotificationMessage<
      GameWillSimulateChoicesMethod,
      GameWillSimulateChoicesParams
    > {}
}
