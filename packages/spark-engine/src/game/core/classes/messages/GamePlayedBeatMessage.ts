import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";
import type { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";

export type GamePlayedBeatMethod = typeof GamePlayedBeatMessage.method;

export interface GamePlayedBeatParams {
  playId: number;
}

export class GamePlayedBeatMessage {
  static readonly method = "game/playedBeat";
  static readonly type = new MessageProtocolNotificationType<
    GamePlayedBeatMethod,
    GamePlayedBeatParams
  >(GamePlayedBeatMessage.method);
}

export namespace GamePlayedBeatMessage {
  export interface Notification extends NotificationMessage<
    GamePlayedBeatMethod,
    GamePlayedBeatParams
  > {}
}
