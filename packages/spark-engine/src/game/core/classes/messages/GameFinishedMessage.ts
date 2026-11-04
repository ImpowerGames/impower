import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";
import type { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";
import type { GameEnding } from "../../types/GameEnding";

export type GameFinishedMethod = typeof GameFinishedMessage.method;

export interface GameFinishedParams extends GameEnding {}

export class GameFinishedMessage {
  static readonly method = "game/finished";
  static readonly type = new MessageProtocolNotificationType<
    GameFinishedMethod,
    GameFinishedParams
  >(GameFinishedMessage.method);
}

export namespace GameFinishedMessage {
  export interface Notification extends NotificationMessage<
    GameFinishedMethod,
    GameFinishedParams
  > {}
}
