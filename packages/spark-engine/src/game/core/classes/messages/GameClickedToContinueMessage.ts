import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/classes/MessageProtocolNotificationType";
import { NotificationMessage } from "@impower/jsonrpc/src/types/NotificationMessage";
import { DocumentLocation } from "../../types/DocumentLocation";

export type GameClickedToContinueMethod =
  typeof GameClickedToContinueMessage.method;

export interface GameClickedToContinueParams {
  location: DocumentLocation;
}

export class GameClickedToContinueMessage {
  static readonly method = "game/clickedToContinue";
  static readonly type = new MessageProtocolNotificationType<
    GameClickedToContinueMethod,
    GameClickedToContinueParams
  >(GameClickedToContinueMessage.method);
}

export namespace GameClickedToContinueMessage {
  export interface Notification
    extends NotificationMessage<
      GameClickedToContinueMethod,
      GameClickedToContinueParams
    > {}
}
