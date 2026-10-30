import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";
import type { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";
import type { GameEnding } from "../../types/GameEnding";

export type GameEndedMethod = typeof GameEndedMessage.method;

export interface GameEndedParams extends GameEnding {}

export class GameEndedMessage {
  static readonly method = "game/ended";
  static readonly type = new MessageProtocolNotificationType<
    GameEndedMethod,
    GameEndedParams
  >(GameEndedMessage.method);
}

export namespace GameEndedMessage {
  export interface Notification extends NotificationMessage<
    GameEndedMethod,
    GameEndedParams
  > {}
}
