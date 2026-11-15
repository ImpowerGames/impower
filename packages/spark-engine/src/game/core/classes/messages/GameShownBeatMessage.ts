import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";
import type { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";

export type GameShownBeatMethod = typeof GameShownBeatMessage.method;

export interface GameShownBeatParams {
  finished: boolean;
}

export class GameShownBeatMessage {
  static readonly method = "game/shownBeat";
  static readonly type = new MessageProtocolNotificationType<
    GameShownBeatMethod,
    GameShownBeatParams
  >(GameShownBeatMessage.method);
}

export namespace GameShownBeatMessage {
  export interface Notification extends NotificationMessage<
    GameShownBeatMethod,
    GameShownBeatParams
  > {}
}
