import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";
import type { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";
import type { GameHistory, SettledBeat } from "../../types/RunHistory";
import type { GameExecutedParams } from "./GameExecutedMessage";

export type GameRolledMethod = typeof GameRolledMessage.method;

export interface GameRolledParams {
  restored: SettledBeat;
  history: GameHistory;
  executed?: GameExecutedParams;
  run?: number;
}

export class GameRolledMessage {
  static readonly method = "game/rolled";
  static readonly type = new MessageProtocolNotificationType<
    GameRolledMethod,
    GameRolledParams
  >(GameRolledMessage.method);
}

export namespace GameRolledMessage {
  export interface Notification extends NotificationMessage<
    GameRolledMethod,
    GameRolledParams
  > {}
}
