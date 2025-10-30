import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";
import { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";
import { DocumentLocation } from "../../types/DocumentLocation";

export type GameChosePathToContinueMethod =
  typeof GameChosePathToContinueMessage.method;

export interface GameChosePathToContinueParams {
  location: DocumentLocation;
}

export class GameChosePathToContinueMessage {
  static readonly method = "game/chosePathToContinue";
  static readonly type = new MessageProtocolNotificationType<
    GameChosePathToContinueMethod,
    GameChosePathToContinueParams
  >(GameChosePathToContinueMessage.method);
}

export namespace GameChosePathToContinueMessage {
  export interface Notification
    extends NotificationMessage<
      GameChosePathToContinueMethod,
      GameChosePathToContinueParams
    > {}
}
