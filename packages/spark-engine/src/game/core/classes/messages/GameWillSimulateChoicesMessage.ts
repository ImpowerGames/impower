import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";
import { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";

export type GameWillSimulateChoicesMethod =
  typeof GameWillSimulateChoicesMessage.method;

export interface GameWillSimulateChoicesParams {
  simulateChoices?: Record<string, (number | undefined)[]> | null;
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
